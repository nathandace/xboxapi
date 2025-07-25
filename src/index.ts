import express, { Request, Response } from 'express';
import axios from 'axios';
import authRoutes from './authRoutes';
import * as auth from './auth';
import { promises as fs } from 'fs';
import * as path from 'path';

const app = express();
app.use(express.json());

// Serve static files for web interface
app.use(express.static(path.join(__dirname, 'public')));

// Configuration interface
interface AppConfig {
    giantBombApiKey?: string;
    enableCoverArt?: boolean;
}

// Load configuration
let config: AppConfig = {
    enableCoverArt: false
};

async function loadConfig(): Promise<void> {
    try {
        const configData = await fs.readFile(path.join(__dirname, 'config.json'), 'utf8');
        const loadedConfig = JSON.parse(configData) as AppConfig;

        // Validate config
        if (loadedConfig.giantBombApiKey && loadedConfig.giantBombApiKey.trim() !== '') {
            config.giantBombApiKey = loadedConfig.giantBombApiKey.trim();
            config.enableCoverArt = true;
            console.log('Cover art enabled with Giant Bomb API key');
        } else {
            config.enableCoverArt = false;
            console.log('Cover art disabled - no Giant Bomb API key configured');
        }
    } catch (error) {
        console.log('No config.json found or invalid - cover art disabled');
        config.enableCoverArt = false;
    }
}

// Mount authentication routes
app.use('/auth', authRoutes);

// Web Interface API Routes
app.get('/api/users', async (req: Request, res: Response) => {
    try {
        const authenticatedUsers = auth.getAuthenticatedUsers();
        const userPromises = authenticatedUsers.map(async (username) => {
            try {
                const tokens = auth.getTokens(username);
                const isExpired = tokens ? Date.now() > tokens.expires_at : true;

                // Try to get gamertag
                let gamertag = username;
                if (tokens && !isExpired) {
                    try {
                        const authorization = auth.getAuthorizationHeader(username);
                        const profileResponse = await axios.get(
                            `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag`,
                            {
                                headers: {
                                    'Authorization': authorization,
                                    'x-xbl-contract-version': '3',
                                    'Accept': 'application/json'
                                },
                                timeout: 3000
                            }
                        );

                        const profileData = profileResponse.data;
                        if (
                            profileData &&
                            typeof profileData === 'object' &&
                            Array.isArray((profileData as any).profileUsers) &&
                            (profileData as any).profileUsers[0] &&
                            Array.isArray((profileData as any).profileUsers[0].settings)
                        ) {
                            gamertag = (profileData as any).profileUsers[0].settings.find((s: any) =>
                                s.id === 'ModernGamertag' || s.id === 'Gamertag'
                            )?.value || username;
                        }
                    } catch (error) {
                        // Ignore errors when fetching gamertag
                    }
                }

                return {
                    username,
                    gamertag,
                    status: isExpired ? 'expired' : 'authenticated',
                    tokenExpiry: tokens ? new Date(tokens.expires_at).toISOString() : null
                };
            } catch (error) {
                return {
                    username,
                    gamertag: username,
                    status: 'error',
                    tokenExpiry: null
                };
            }
        });

        const users = await Promise.all(userPromises);
        res.json(users);
    } catch (error) {
        console.error('Error getting users:', error);
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
        console.error('Error removing user:', error);
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

// Xbox Glass API endpoints

// Helper function to get authorization header for a user with auto-refresh
async function getAuthorizationHeader(username: string): Promise<string> {
    let tokens = auth.getTokens(username);

    if (!tokens) {
        throw new Error(`No tokens found for user: ${username}`);
    }

    // Check if token is expired or expiring within 5 minutes
    if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
        console.log(`Token for ${username} is expired or expiring soon, attempting refresh...`);
        try {
            tokens = await auth.refreshTokens(username);
            console.log(`Successfully refreshed tokens for ${username}`);
        } catch (error) {
            console.error(`Failed to refresh tokens for ${username}:`, error);
            throw new Error(`Token expired and refresh failed for ${username}`);
        }
    }

    return `XBL3.0 x=${tokens.user_hash};${tokens.xsts_token}`;
}

// Helper function to clean game name for search
function cleanGameName(gameName: string): string {
    return gameName
        // Remove trademark symbols
        .replace(/[™®©]/g, '')
        // Remove special characters except letters, numbers, spaces, and common punctuation
        .replace(/[^\w\s\-:.&]/g, '')
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Trim whitespace
        .trim();
}

// Helper function to get game cover art from Giant Bomb API
async function getGameCoverArt(gameName: string): Promise<string | null> {
    // Check if cover art is enabled
    if (!config.enableCoverArt || !config.giantBombApiKey) {
        return null;
    }

    try {
        const cleanedName = cleanGameName(gameName);
        console.log(`Searching for cover art for: "${cleanedName}"`);

        interface GiantBombSearchResult {
            image?: { original_url?: string };
            [key: string]: any;
        }
        interface GiantBombResponse {
            results?: GiantBombSearchResult[];
            error?: string;
            status_code?: number;
            [key: string]: any;
        }

        const response = await axios.get<GiantBombResponse>(
            `https://www.giantbomb.com/api/search/`,
            {
                params: {
                    api_key: config.giantBombApiKey,
                    format: 'json',
                    query: cleanedName,
                    resources: 'game',
                    limit: 1 // Only get the first result
                },
                headers: {
                    'User-Agent': 'Xbox-Auth-API/1.0'
                },
                timeout: 5000 // 5 second timeout
            }
        );

        // Check for API errors
        if (response.data?.error || response.data?.status_code !== 1) {
            console.warn(`Giant Bomb API error for "${cleanedName}": ${response.data?.error || 'Unknown error'}`);
            return null;
        }

        const results = response.data?.results;
        if (results && results.length > 0 && results[0].image?.original_url) {
            console.log(`Found cover art for "${cleanedName}": ${results[0].image.original_url}`);
            return results[0].image.original_url;
        }

        console.log(`No cover art found for "${cleanedName}"`);
        return null;

    } catch (error) {
        // Handle different types of errors gracefully
        const err = error as any;

        if (err.code === 'ECONNABORTED') {
            console.warn(`Giant Bomb API timeout for "${gameName}"`);
        } else if (err.response) {
            console.warn(`Giant Bomb API HTTP error ${err.response.status} for "${gameName}"`);
        } else if (err.request) {
            console.warn(`Giant Bomb API network error for "${gameName}"`);
        } else if (err.message) {
            console.warn(`Giant Bomb API request error for "${gameName}": ${err.message}`);
        } else {
            console.warn(`Unexpected error fetching cover art for "${gameName}":`, error);
        }

        // Always return null on error - never throw
        return null;
    }
}

// Get Xbox user profile
app.get('/xbox/profile/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);

        const profileResponse = await axios.get(
            `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,RealName,Bio,Location,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`,
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
            profile: profileResponse.data
        });

    } catch (error) {
        console.error('Xbox profile error:', error);
        const err = error as any;
        if (err.message.includes('No tokens') || err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox profile',
            details: err.response?.data || err.message
        });
    }
});

// Get Xbox user presence (online status)
app.get('/xbox/presence/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);

        const presenceResponse = await axios.get(
            `https://userpresence.xboxlive.com/users/me?level=all`,
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

    } catch (error) {
        console.error('Xbox presence error:', error);
        const err = error as any;
        if (err.message.includes('No tokens') || err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox presence',
            details: err.response?.data || err.message
        });
    }
});

// Get Xbox friends list
app.get('/xbox/friends/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);

        const friendsResponse = await axios.get(
            `https://social.xboxlive.com/users/me/people`,
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

    } catch (error) {
        console.error('Xbox friends error:', error);
        const err = error as any;
        if (err.message.includes('No tokens') || err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox friends',
            details: err.response?.data || err.message
        });
    }
});

// Get Xbox achievements for a specific title
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

    } catch (error) {
        console.error('Xbox achievements error:', error);
        const err = error as any;
        if (err.message.includes('No tokens') || err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox achievements',
            details: err.response?.data || err.message
        });
    }
});

// Get Xbox recent games
app.get('/xbox/games/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);

        const gamesResponse = await axios.get(
            `https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail`,
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

    } catch (error) {
        console.error('Xbox games error:', error);
        const err = error as any;
        if (err.message.includes('No tokens') || err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox games',
            details: err.response?.data || err.message
        });
    }
});

// Get comprehensive Xbox status for a user (profile + presence + recent games)
app.get('/xbox/status/:username', async (req: Request, res: Response) => {
    const { username } = req.params;

    try {
        const authorization = await getAuthorizationHeader(username);

        // Make multiple requests in parallel
        const [profileResponse, presenceResponse, gamesResponse] = await Promise.allSettled([
            axios.get(
                `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`,
                {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                }
            ),
            axios.get(
                `https://userpresence.xboxlive.com/users/me?level=all`,
                {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                }
            ),
            axios.get(
                `https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail`,
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

    } catch (error) {
        console.error('Xbox status error:', error);
        const err = error as any;
        if (err.message.includes('No tokens') || err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                action: 'Please authenticate or refresh tokens'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to get Xbox status',
            details: err.message
        });
    }
});

// Get bulk status for all authenticated users
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

            // Get basic profile and presence for each user
            const [profileResponse, presenceResponse] = await Promise.allSettled([
                axios.get(
                    `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`,
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                ),
                axios.get(
                    `https://userpresence.xboxlive.com/users/me?level=all`,
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

// Get current games being played and which users are playing them (simplified for Home Assistant)
app.get('/xbox/status', async (req: Request, res: Response) => {
    const authenticatedUsers = auth.getAuthenticatedUsers();

    if (authenticatedUsers.length === 0) {
        return res.json({
            success: true,
            xboxStatus: 'unknown',
            activeGame: null,
            users: [],
            message: 'No authenticated users'
        });
    }

    // Pre-refresh all tokens if needed before making API calls
    for (const username of authenticatedUsers) {
        try {
            await getAuthorizationHeader(username); // This will auto-refresh if needed
        } catch (error) {
            console.error(`Failed to prepare auth for ${username}:`, error);
        }
    }

    const userPresencePromises = authenticatedUsers.map(async (username) => {
        try {
            // Get fresh authorization header (should be ready now)
            const authorization = auth.getAuthorizationHeader(username);

            // Get profile and presence
            const [profileResponse, presenceResponse] = await Promise.allSettled([
                axios.get(
                    `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`,
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                ),
                axios.get(
                    `https://userpresence.xboxlive.com/users/me?level=all`,
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                )
            ]);

            const userInfo: any = {
                username,
                authenticated: true,
                gamertag: username
            };

            // Extract gamertag
            if (profileResponse.status === 'fulfilled') {
                const profileData = profileResponse.value.data;
                let gamertag = username;
                if (
                    profileData &&
                    typeof profileData === 'object' &&
                    Array.isArray((profileData as any).profileUsers) &&
                    (profileData as any).profileUsers[0] &&
                    Array.isArray((profileData as any).profileUsers[0].settings)
                ) {
                    gamertag = (profileData as any).profileUsers[0].settings.find((s: any) =>
                        s.id === 'ModernGamertag' || s.id === 'Gamertag'
                    )?.value || username;
                }
                userInfo.gamertag = gamertag;
            }

            // Extract current game info and Xbox status
            if (presenceResponse.status === 'fulfilled') {
                const presenceData = presenceResponse.value.data as { state?: string; devices?: any[] };
                userInfo.state = presenceData?.state || 'Offline';

                // Check if user is currently on any device
                const devices = presenceData?.devices || [];

                for (const device of devices) {
                    // Mark Xbox as online if user has any Xbox device active (fixed device type)
                    const isXboxDevice = device.type === 'Scarlett' || device.type === 'XboxOne' || device.type === 'XboxSeriesX' || device.type === 'Xbox360' || device.type === 'XboxSeriesS';

                    if (isXboxDevice) {
                        userInfo.xboxDevice = device.type;
                        userInfo.xboxOnline = true;

                        // Look for active games (Full placement) or Home screen (Background placement)
                        const titles = device?.titles || [];
                        for (const title of titles) {
                            // Check for active games first (Full placement)
                            if (title?.placement === 'Full' && title?.state === 'Active') {
                                userInfo.currentGame = {
                                    id: title.id,
                                    name: title.name,
                                    activity: title.activity
                                };
                                break;
                            }
                        }

                        // If no active game found, check if user is on Home screen
                        if (!userInfo.currentGame) {
                            for (const title of titles) {
                                if (title?.name === 'Home' && title?.state === 'Active') {
                                    // User is on Xbox Home screen
                                    userInfo.onHomeScreen = true;
                                    break;
                                }
                            }
                        }

                        break; // Found Xbox device, no need to check others
                    }
                }
            }

            return userInfo;

        } catch (error) {
            return {
                username,
                authenticated: false,
                error: (error as any).message
            };
        }
    });

    const userResults = await Promise.all(userPresencePromises);

    // Determine Xbox status and active game
    let xboxStatus = 'off';
    let activeGame: { id: any; name: any; activity: any; coverArtUrl?: string; } | null = null;
    const usersInGame: any[] = [];
    const allUsers: any[] = [];

    userResults.forEach(user => {
        if (!user.authenticated) {
            return;
        }

        // Add to all users list
        allUsers.push({
            username: user.username,
            gamertag: user.gamertag,
            state: user.state,
            xboxOnline: user.xboxOnline || false
        });

        // Check if Xbox is online
        if (user.xboxOnline) {
            xboxStatus = 'on';

            // Check if user is playing a game
            if (user.currentGame) {
                // Set the active game (assuming all users play the same game in split-screen)
                if (!activeGame) {
                    activeGame = {
                        id: user.currentGame.id,
                        name: user.currentGame.name,
                        activity: user.currentGame.activity
                    };
                }

                // Add user to the game
                usersInGame.push({
                    username: user.username,
                    gamertag: user.gamertag,
                    activity: user.currentGame.activity
                });
            }
        }
    });

    // If Xbox is on but no game detected, check if anyone is just on the dashboard
    if (xboxStatus === 'on' && !activeGame) {
        const dashboardUsers = allUsers.filter(u => u.xboxOnline);
        if (dashboardUsers.length > 0) {
            activeGame = {
                id: 'dashboard',
                name: 'Xbox Dashboard',
                activity: 'On Xbox Home'
            };
            usersInGame.push(...dashboardUsers.map(u => ({
                username: u.username,
                gamertag: u.gamertag,
                activity: 'On Xbox Home'
            })));
        }
    }

    // Get cover art for the active game (if it's not the dashboard)
    if (activeGame && activeGame.id !== 'dashboard') {
        try {
            const coverArtUrl = await getGameCoverArt(activeGame.name);
            if (coverArtUrl) {
                activeGame.coverArtUrl = coverArtUrl;
            }
        } catch (error) {
            console.error('Error fetching cover art:', error);
        }
    }

    res.json({
        success: true,
        xboxStatus: xboxStatus, // 'on', 'off', or 'unknown'
        activeGame: activeGame, // null if no game/app active, includes coverArtUrl if found
        users: usersInGame, // users currently in the game/app
        timestamp: new Date().toISOString()
    });
});

// Get users playing a specific game
app.get('/xbox/game/:gameId/players', async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const authenticatedUsers = auth.getAuthenticatedUsers();

    if (authenticatedUsers.length === 0) {
        return res.json({
            success: true,
            message: 'No authenticated users',
            gameId: gameId,
            players: []
        });
    }

    const userPresencePromises = authenticatedUsers.map(async (username) => {
        try {
            const authorization = await getAuthorizationHeader(username);

            const [profileResponse, presenceResponse] = await Promise.allSettled([
                axios.get(
                    `https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`,
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                ),
                axios.get(
                    `https://userpresence.xboxlive.com/users/me?level=all`,
                    {
                        headers: {
                            'Authorization': authorization,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        }
                    }
                )
            ]);

            let gamertag = username;
            if (profileResponse.status === 'fulfilled') {
                const profileData = profileResponse.value.data;
                if (
                    profileData &&
                    typeof profileData === 'object' &&
                    Array.isArray((profileData as any).profileUsers) &&
                    (profileData as any).profileUsers[0] &&
                    Array.isArray((profileData as any).profileUsers[0].settings)
                ) {
                    gamertag = (profileData as any).profileUsers[0].settings.find((s: any) =>
                        s.id === 'ModernGamertag' || s.id === 'Gamertag'
                    )?.value || username;
                }
            }

            if (presenceResponse.status === 'fulfilled') {
                const presenceData = presenceResponse.value.data as { devices?: any[] };
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
            }

            return null; // User not playing this game

        } catch (error) {
            return null;
        }
    });

    const results = await Promise.all(userPresencePromises);
    const playersInGame = results.filter(result => result !== null);

    res.json({
        success: true,
        gameId: gameId,
        gameName: playersInGame.length > 0 ? playersInGame[0].gameName : 'Unknown Game',
        playerCount: playersInGame.length,
        players: playersInGame,
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
    const stats = auth.getAuthStats();

    res.json({
        success: true,
        message: 'Xbox Authentication API is running',
        clientId: '000000004C12AE6F',
        authenticatedUsers: auth.getAuthenticatedUsers(),
        stats: stats,
        timestamp: new Date().toISOString()
    });
});

// Load existing tokens and config on startup
async function initializeServer() {
    await loadConfig();
    await auth.loadTokens();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Xbox Authentication API running on port ${PORT}`);
    console.log(`\nUsing Xbox Live client ID: 000000004C12AE6F`);
    console.log(`No Azure registration needed!`);

    // Initialize server configuration
    await initializeServer();

    console.log(`\n🌐 Web Interface: http://localhost:${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);

    console.log(`\nTo authenticate users:`);
    console.log(`1. Open http://localhost:${PORT} in your browser`);
    console.log(`2. Click "Add User" and enter email/username`);
    console.log(`3. Complete Xbox Live sign-in in the popup window`);

    console.log(`\nAPI Endpoints:`);
    console.log(`GET http://localhost:${PORT}/xbox/status - See XBox status and active games`);
    console.log(`GET http://localhost:${PORT}/xbox/profile/{username} - Get user profile`);

    if (config.enableCoverArt) {
        console.log(`\n🎨 Cover art enabled via Giant Bomb API`);
    } else {
        console.log(`\n📝 Cover art disabled - add Giant Bomb API key to config.json to enable`);
    }
});

export default app;