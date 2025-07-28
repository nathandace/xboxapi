import express, { Request, Response } from 'express';
import axios from 'axios';
import authRoutes from './authRoutes';
import * as auth from './auth';
import { promises as fs } from 'fs';
import * as path from 'path';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration
interface AppConfig {
    giantBombApiKey?: string;
    enableCoverArt?: boolean;
}
interface GiantBombSearchResponse {
    status_code: number;
    results?: Array<{
        image?: {
            original_url?: string;
        };
    }>;
}

let config: AppConfig = { enableCoverArt: false };
const coverArtCache = new Map<string, string | null>();
const cache: { timestamp: number; data: any } = { timestamp: 0, data: null };

// Load configuration on startup
async function loadConfig(): Promise<void> {
    try {
        const configData = await fs.readFile(path.join(__dirname, 'config.json'), 'utf8');
        const loadedConfig = JSON.parse(configData) as AppConfig;

        if (loadedConfig.giantBombApiKey?.trim()) {
            config.giantBombApiKey = loadedConfig.giantBombApiKey.trim();
            config.enableCoverArt = true;
            console.log('Cover art enabled with Giant Bomb API key');
        } else {
            config.enableCoverArt = false;
            console.log('Cover art disabled - no Giant Bomb API key configured');
        }
    } catch {
        console.log('No config.json found - cover art disabled');
        config.enableCoverArt = false;
    }
}

// Utility functions
function logError(operation: string, error: any, username?: string): void {
    const prefix = username ? `[${username}]` : '';
    console.error(`${prefix} ${operation} error:`, error.response?.data || error.message || error);
}

function cleanGameName(gameName: string): string {
    return gameName
        .replace(/[™®©]/g, '')
        .replace(/[^\w\s\-:.&]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Xbox API authentication helpers
async function getAuthorizationHeader(username: string, forceRefresh: boolean = false): Promise<string> {
    let tokens = auth.getTokens(username);

    if (!tokens) {
        throw new Error(`No tokens found for user: ${username}`);
    }

    if (forceRefresh || Date.now() > tokens.expires_at - 5 * 60 * 1000) {
        const reason = forceRefresh ? 'forced refresh due to 401' : 'token expired or expiring soon';
        console.log(`[${username}] ${reason}, attempting refresh...`);

        try {
            tokens = await auth.refreshTokens(username);
            console.log(`[${username}] Successfully refreshed tokens`);
        } catch (error) {
            logError('Token refresh failed', error, username);
            throw new Error(`Token expired and refresh failed for ${username}`);
        }
    }

    return `XBL3.0 x=${tokens.user_hash};${tokens.xsts_token}`;
}

async function makeXboxApiCall(username: string, apiCall: (authorization: string) => Promise<any>): Promise<any> {
    try {
        const authorization = await getAuthorizationHeader(username);
        return await apiCall(authorization);
    } catch (error: any) {
        if (error.response?.status === 401) {
            console.log(`[${username}] 401 error, forcing token refresh and retrying...`);
            try {
                const freshAuthorization = await getAuthorizationHeader(username, true);
                return await apiCall(freshAuthorization);
            } catch (retryError: any) {
                logError('Retry failed', retryError, username);
                throw retryError;
            }
        }
        throw error;
    }
}

async function getGameCoverArt(gameName: string): Promise<string | null> {
    if (!config.enableCoverArt || !config.giantBombApiKey) {
        return null;
    }

    const cleanedName = cleanGameName(gameName);

    if (coverArtCache.has(cleanedName)) {
        return coverArtCache.get(cleanedName) || null;
    }

    try {
        const response = await axios.get<GiantBombSearchResponse>('https://www.giantbomb.com/api/search/', {
            params: {
                api_key: config.giantBombApiKey,
                format: 'json',
                query: cleanedName,
                resources: 'game',
                limit: 1
            },
            headers: { 'User-Agent': 'Xbox-Auth-API/1.0' },
            timeout: 5000
        });

        if (response.data?.status_code !== 1) {
            coverArtCache.set(cleanedName, null);
            return null;
        }

        const game = response.data?.results?.[0];
        const coverUrl = game?.image?.original_url || null;

        coverArtCache.set(cleanedName, coverUrl);
        return coverUrl;
    } catch (error) {
        logError('Cover art fetch failed', error);
        coverArtCache.set(cleanedName, null);
        return null;
    }
}

// Mount routes
app.use('/auth', authRoutes);

// User Management API
app.get('/api/users', async (req: Request, res: Response) => {
    try {
        const authenticatedUsers = auth.getAuthenticatedUsers();
        const userPromises = authenticatedUsers.map(async (username) => {
            try {
                const tokens = auth.getTokens(username);
                const isExpired = tokens ? Date.now() > tokens.expires_at : true;
                const tokenAge = tokens ? Math.floor((Date.now() - tokens.timestamp) / (1000 * 60 * 60 * 24)) : 0;
                const estimatedRefreshDaysLeft = Math.max(0, 90 - tokenAge);
                const gamertag = auth.getStoredGamertag(username) || username;

                return {
                    username,
                    gamertag,
                    status: isExpired ? 'expired' : 'authenticated',
                    tokenExpiry: tokens ? new Date(tokens.expires_at).toISOString() : null,
                    tokenAge,
                    estimatedRefreshDaysLeft,
                    authTimestamp: tokens ? new Date(tokens.timestamp).toISOString() : null
                };
            } catch (error) {
                return {
                    username,
                    gamertag: username,
                    status: 'error',
                    tokenExpiry: null,
                    tokenAge: 0,
                    estimatedRefreshDaysLeft: 0,
                    authTimestamp: null
                };
            }
        });

        const users = await Promise.all(userPromises);
        res.json(users);
    } catch (error) {
        logError('Get users failed', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

app.delete('/api/users/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const removed = await auth.removeUser(username);
        if (removed) {
            res.json({ success: true, message: `User ${username} removed successfully` });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        logError('Remove user failed', error, username);
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

// Individual Xbox API Endpoints
app.get('/xbox/profile/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);
        const profileResponse = await axios.get(
            'https://profile.xboxlive.com/users/me/profile/settings',
            {
                params: {
                    settings: 'Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,RealName,Bio,Location,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag'
                },
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '3',
                    'Accept': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            username,
            profile: profileResponse.data
        });
    } catch (error: any) {
        logError('Xbox profile failed', error, username);

        if (error.message?.includes('No tokens') || error.message?.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: error.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox profile',
            details: error.response?.data || error.message
        });
    }
});

app.get('/xbox/presence/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);
        const presenceResponse = await axios.get(
            'https://userpresence.xboxlive.com/users/me?level=all',
            {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '3',
                    'Accept': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            username,
            presence: presenceResponse.data
        });
    } catch (error: any) {
        logError('Xbox presence failed', error, username);

        if (error.message?.includes('No tokens') || error.message?.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: error.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox presence',
            details: error.response?.data || error.message
        });
    }
});

app.get('/xbox/friends/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);
        const friendsResponse = await axios.get(
            'https://social.xboxlive.com/users/me/people',
            {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '5',
                    'Accept': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            username,
            friends: friendsResponse.data
        });
    } catch (error: any) {
        logError('Xbox friends failed', error, username);

        if (error.message?.includes('No tokens') || error.message?.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: error.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox friends',
            details: error.response?.data || error.message
        });
    }
});

app.get('/xbox/achievements/:username/:titleId', async (req: Request, res: Response) => {
    const { username, titleId } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);
        const achievementsResponse = await axios.get(
            `https://achievements.xboxlive.com/users/me/achievements?titleId=${titleId}&maxItems=1000`,
            {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '4',
                    'Accept': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            username,
            titleId,
            achievements: achievementsResponse.data
        });
    } catch (error: any) {
        logError('Xbox achievements failed', error, username);

        if (error.message?.includes('No tokens') || error.message?.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: error.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox achievements',
            details: error.response?.data || error.message
        });
    }
});

app.get('/xbox/games/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);
        const gamesResponse = await axios.get(
            'https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail',
            {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '2',
                    'Accept': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            username,
            games: gamesResponse.data
        });
    } catch (error: any) {
        logError('Xbox games failed', error, username);

        if (error.message?.includes('No tokens') || error.message?.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: error.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox games',
            details: error.response?.data || error.message
        });
    }
});

// Aggregate Xbox API Endpoints
app.get('/xbox/status/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);

        const [profileResponse, presenceResponse, gamesResponse] = await Promise.allSettled([
            axios.get(
                'https://profile.xboxlive.com/users/me/profile/settings',
                {
                    params: {
                        settings: 'Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag'
                    },
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                }
            ),
            axios.get(
                'https://userpresence.xboxlive.com/users/me?level=all',
                {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                }
            ),
            axios.get(
                'https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail',
                {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '2',
                        'Accept': 'application/json'
                    }
                }
            )
        ]);

        const result: any = {
            success: true,
            username,
            timestamp: new Date().toISOString()
        };

        if (profileResponse.status === 'fulfilled') {
            result.profile = profileResponse.value.data;
        } else {
            result.profileError = profileResponse.reason.message;
        }

        if (presenceResponse.status === 'fulfilled') {
            result.presence = presenceResponse.value.data;
        } else {
            result.presenceError = presenceResponse.reason.message;
        }

        if (gamesResponse.status === 'fulfilled') {
            result.recentGames = gamesResponse.value.data;
        } else {
            result.gamesError = gamesResponse.reason.message;
        }

        res.json(result);
    } catch (error: any) {
        logError('Xbox status failed', error, username);

        if (error.message?.includes('No tokens') || error.message?.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: error.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox status',
            details: error.message
        });
    }
});

app.get('/xbox/status-all', async (req: Request, res: Response) => {
    const authenticatedUsers = auth.getAuthenticatedUsers();

    if (authenticatedUsers.length === 0) {
        return res.json({
            success: true,
            message: 'No authenticated users',
            users: []
        });
    }

    const userStatusPromises = authenticatedUsers.map(async (username) => {
        try {
            const authorization = await getAuthorizationHeader(username);

            const [profileResponse, presenceResponse] = await Promise.allSettled([
                axios.get(
                    'https://profile.xboxlive.com/users/me/profile/settings',
                    {
                        params: {
                            settings: 'Gamertag,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag'
                        },
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                ),
                axios.get(
                    'https://userpresence.xboxlive.com/users/me?level=all',
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                )
            ]);

            const userStatus: any = {
                username,
                authenticated: true
            };

            if (profileResponse.status === 'fulfilled') {
                userStatus.profile = profileResponse.value.data;
            }

            if (presenceResponse.status === 'fulfilled') {
                userStatus.presence = presenceResponse.value.data;
            }

            return userStatus;
        } catch (error) {
            return {
                username,
                authenticated: false,
                error: (error as any).message
            };
        }
    });

    const results = await Promise.all(userStatusPromises);

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        totalUsers: authenticatedUsers.length,
        users: results
    });
});

// Primary Multi-Profile Xbox Status Endpoint (for Home Assistant)
app.get('/xbox/status', async (req: Request, res: Response) => {
    const now = Date.now();

    if (cache.data && now - cache.timestamp < 10000) {
        return res.json(cache.data);
    }

    const authenticatedUsers = auth.getAuthenticatedUsers();

    if (authenticatedUsers.length === 0) {
        const response = { success: true, activeGame: null, users: [] };
        cache.data = response;
        cache.timestamp = now;
        return res.json(response);
    }

    // Pre-refresh tokens if needed
    for (const username of authenticatedUsers) {
        try {
            await getAuthorizationHeader(username);
        } catch (error) {
            logError('Failed to prepare auth', error, username);
        }
    }

    const userPresencePromises = authenticatedUsers.map(async (username) => {
        try {
            const gamertag = auth.getStoredGamertag(username) || username;

            const presenceData = await makeXboxApiCall(username, async (authorization) => {
                const response = await axios.get(
                    'https://userpresence.xboxlive.com/users/me?level=all',
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        },
                        timeout: 5000
                    }
                );
                return response.data;
            });

            const devices = presenceData?.devices || [];

            for (const device of devices) {
                const isXboxDevice = ['Scarlett', 'XboxOne', 'XboxSeriesX', 'Xbox360', 'XboxSeriesS'].includes(device.type);

                if (isXboxDevice) {
                    const titles = device?.titles || [];

                    for (const title of titles) {
                        if (title?.placement === 'Full' && title?.state === 'Active' && title?.name !== 'Home') {
                            return {
                                username,
                                gamertag,
                                currentGame: {
                                    id: title.id,
                                    name: title.name
                                }
                            };
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            logError('Get presence failed', error, username);
            return null;
        }
    });

    const userResults = await Promise.all(userPresencePromises);
    const activeUsers = userResults.filter(user => user !== null);

    let activeGame: { id: string; name: string; coverArtUrl?: string } | null = null;
    const usersInGame: { username: string; gamertag: string }[] = [];

    if (activeUsers.length > 0) {
        const firstUser = activeUsers[0];
        activeGame = {
            id: firstUser.currentGame.id,
            name: firstUser.currentGame.name
        };

        activeUsers.forEach(user => {
            usersInGame.push({
                username: user.username,
                gamertag: user.gamertag
            });
        });

        try {
            const coverArtUrl = await getGameCoverArt(activeGame.name);
            if (coverArtUrl) {
                activeGame.coverArtUrl = coverArtUrl;
            }
        } catch (error) {
            logError('Cover art fetch failed', error);
        }
    }

    const response = {
        success: true,
        activeGame,
        users: usersInGame
    };

    cache.data = response;
    cache.timestamp = now;

    res.json(response);
});

app.get('/xbox/game/:gameId/players', async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const authenticatedUsers = auth.getAuthenticatedUsers();

    if (authenticatedUsers.length === 0) {
        return res.json({
            success: true,
            message: 'No authenticated users',
            gameId,
            players: []
        });
    }

    const userPresencePromises = authenticatedUsers.map(async (username) => {
        try {
            const authorization = await getAuthorizationHeader(username);
            const gamertag = auth.getStoredGamertag(username) || username;

            const presenceResponse = await axios.get(
                'https://userpresence.xboxlive.com/users/me?level=all',
                {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                }
            );

            const presenceData = presenceResponse.data as { devices?: any[] };
            const devices = presenceData?.devices || [];

            for (const device of devices) {
                const titles = device?.titles || [];
                for (const title of titles) {
                    if (title?.id === gameId && title?.placement === 'Full' && title?.state === 'Active') {
                        return {
                            username,
                            gamertag,
                            activity: title.activity,
                            device: device.type,
                            state: title.state,
                            gameName: title.name
                        };
                    }
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    });

    const results = await Promise.all(userPresencePromises);
    const playersInGame = results.filter(result => result !== null);

    res.json({
        success: true,
        gameId,
        gameName: playersInGame.length > 0 ? playersInGame[0].gameName : 'Unknown Game',
        playerCount: playersInGame.length,
        players: playersInGame,
        timestamp: new Date().toISOString()
    });
});

// System endpoints
app.get('/health', (req: Request, res: Response) => {
    const stats = auth.getAuthStats();

    res.json({
        success: true,
        message: 'Xbox Authentication API is running',
        clientId: '000000004C12AE6F',
        authenticatedUsers: auth.getAuthenticatedUsers(),
        stats,
        timestamp: new Date().toISOString()
    });
});

// Server initialization
async function initializeServer() {
    await loadConfig();
    await auth.loadTokens();
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`Xbox Authentication API running on port ${PORT}`);
    console.log('Using Xbox Live client ID: 000000004C12AE6F');

    await initializeServer();

    console.log(`\n🌐 Web Interface: http://localhost:${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);
    console.log(`🎮 Xbox Status: http://localhost:${PORT}/xbox/status`);

    if (config.enableCoverArt) {
        console.log('\n🎨 Cover art enabled via Giant Bomb API');
    } else {
        console.log('\n📝 Cover art disabled - add Giant Bomb API key to config.json to enable');
    }
});

export default app;