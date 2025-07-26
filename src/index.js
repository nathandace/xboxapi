"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const authRoutes_1 = __importDefault(require("./authRoutes"));
const auth = __importStar(require("./auth"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Serve static files for web interface
app.use(express_1.default.static(path.join(__dirname, 'public')));
// Load configuration
let config = {
    enableCoverArt: false
};
// Cache for cover art to prevent repeated API calls
const coverArtCache = new Map();
function loadConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const configData = yield fs_1.promises.readFile(path.join(__dirname, 'config.json'), 'utf8');
            const loadedConfig = JSON.parse(configData);
            // Validate config
            if (loadedConfig.giantBombApiKey && loadedConfig.giantBombApiKey.trim() !== '') {
                config.giantBombApiKey = loadedConfig.giantBombApiKey.trim();
                config.enableCoverArt = true;
                console.log('Cover art enabled with Giant Bomb API key');
            }
            else {
                config.enableCoverArt = false;
                console.log('Cover art disabled - no Giant Bomb API key configured');
            }
        }
        catch (error) {
            console.log('No config.json found or invalid - cover art disabled');
            config.enableCoverArt = false;
        }
    });
}
// Mount authentication routes
app.use('/auth', authRoutes_1.default);
// Web Interface API Routes
app.get('/api/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authenticatedUsers = auth.getAuthenticatedUsers();
        const userPromises = authenticatedUsers.map((username) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const tokens = auth.getTokens(username);
                const isExpired = tokens ? Date.now() > tokens.expires_at : true;
                // Calculate token age for refresh token estimation
                const tokenAge = tokens ? Math.floor((Date.now() - tokens.timestamp) / (1000 * 60 * 60 * 24)) : 0;
                const estimatedRefreshDaysLeft = Math.max(0, 90 - tokenAge);
                // Get stored gamertag (no API call needed!)
                const gamertag = auth.getStoredGamertag(username) || username;
                return {
                    username,
                    gamertag,
                    status: isExpired ? 'expired' : 'authenticated',
                    tokenExpiry: tokens ? new Date(tokens.expires_at).toISOString() : null,
                    tokenAge: tokenAge,
                    estimatedRefreshDaysLeft: estimatedRefreshDaysLeft,
                    authTimestamp: tokens ? new Date(tokens.timestamp).toISOString() : null
                };
            }
            catch (error) {
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
        }));
        const users = yield Promise.all(userPromises);
        res.json(users);
    }
    catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
}));
app.delete('/api/users/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username } = req.params;
    try {
        const removed = yield auth.removeUser(username);
        if (removed) {
            res.json({ success: true, message: `User ${username} removed successfully` });
        }
        else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    }
    catch (error) {
        console.error('Error removing user:', error);
        res.status(500).json({ error: 'Failed to remove user' });
    }
}));
// Xbox Glass API endpoints
// Helper function to get authorization header for a user with auto-refresh
function getAuthorizationHeader(username) {
    return __awaiter(this, void 0, void 0, function* () {
        let tokens = auth.getTokens(username);
        if (!tokens) {
            throw new Error(`No tokens found for user: ${username}`);
        }
        // Check if token is expired or expiring within 5 minutes
        if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
            console.log(`Token for ${username} is expired or expiring soon, attempting refresh...`);
            try {
                tokens = yield auth.refreshTokens(username);
                console.log(`Successfully refreshed tokens for ${username}`);
            }
            catch (error) {
                console.error(`Failed to refresh tokens for ${username}:`, error);
                throw new Error(`Token expired and refresh failed for ${username}`);
            }
        }
        return `XBL3.0 x=${tokens.user_hash};${tokens.xsts_token}`;
    });
}
// Helper function to clean game name for search
function cleanGameName(gameName) {
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
function getGameCoverArt(gameName) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        if (!config.enableCoverArt || !config.giantBombApiKey) {
            return null;
        }
        const cleanedName = cleanGameName(gameName);
        // Check cache first
        if (coverArtCache.has(cleanedName)) {
            const cached = coverArtCache.get(cleanedName);
            console.log(`Using cached cover art result for "${cleanedName}": ${cached ? 'found' : 'not found'}`);
            return typeof cached === 'undefined' ? null : cached;
        }
        try {
            console.log(`Searching for cover art for: "${cleanedName}"`);
            const response = yield axios_1.default.get(`https://www.giantbomb.com/api/search/`, {
                params: {
                    api_key: config.giantBombApiKey,
                    format: 'json',
                    query: cleanedName,
                    resources: 'game',
                    limit: 1
                },
                headers: {
                    'User-Agent': 'Xbox-Auth-API/1.0'
                },
                timeout: 5000
            });
            // Giant Bomb API quirk: "error": "OK" actually means success!
            if (((_a = response.data) === null || _a === void 0 ? void 0 : _a.status_code) !== 1) {
                console.warn(`Giant Bomb API failed for "${cleanedName}": status_code=${(_b = response.data) === null || _b === void 0 ? void 0 : _b.status_code}, error=${(_c = response.data) === null || _c === void 0 ? void 0 : _c.error}`);
                coverArtCache.set(cleanedName, null); // Cache the failure
                return null;
            }
            const results = (_d = response.data) === null || _d === void 0 ? void 0 : _d.results;
            if (results && results.length > 0) {
                const game = results[0];
                console.log(`Found game result: "${game.name || 'Unknown'}" for search "${cleanedName}"`);
                if ((_e = game.image) === null || _e === void 0 ? void 0 : _e.original_url) {
                    console.log(`Found cover art for "${cleanedName}": ${game.image.original_url}`);
                    coverArtCache.set(cleanedName, game.image.original_url); // Cache the success
                    return game.image.original_url;
                }
                else {
                    console.log(`Game found but no image available for "${cleanedName}"`);
                    coverArtCache.set(cleanedName, null); // Cache the no-image result
                    return null;
                }
            }
            console.log(`No games found for "${cleanedName}"`);
            coverArtCache.set(cleanedName, null); // Cache the no-results
            return null;
        }
        catch (error) {
            const err = error;
            console.warn(`Error fetching cover art for "${gameName}":`, err.message);
            coverArtCache.set(cleanedName, null); // Cache the error
            return null;
        }
    });
}
// Get Xbox user profile
app.get('/xbox/profile/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    try {
        const authorization = yield getAuthorizationHeader(username);
        const profileResponse = yield axios_1.default.get(`https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,RealName,Bio,Location,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`, {
            headers: {
                'Authorization': authorization,
                'x-xbl-contract-version': '3',
                'Accept': 'application/json'
            }
        });
        res.json({
            success: true,
            username,
            profile: profileResponse.data
        });
    }
    catch (error) {
        console.error('Xbox profile error:', error);
        const err = error;
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
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message
        });
    }
}));
// Get Xbox user presence (online status)
app.get('/xbox/presence/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    try {
        const authorization = yield getAuthorizationHeader(username);
        const presenceResponse = yield axios_1.default.get(`https://userpresence.xboxlive.com/users/me?level=all`, {
            headers: {
                'Authorization': authorization,
                'x-xbl-contract-version': '3',
                'Accept': 'application/json'
            }
        });
        res.json({
            success: true,
            username,
            presence: presenceResponse.data
        });
    }
    catch (error) {
        console.error('Xbox presence error:', error);
        const err = error;
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
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message
        });
    }
}));
// Get Xbox friends list
app.get('/xbox/friends/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    try {
        const authorization = yield getAuthorizationHeader(username);
        const friendsResponse = yield axios_1.default.get(`https://social.xboxlive.com/users/me/people`, {
            headers: {
                'Authorization': authorization,
                'x-xbl-contract-version': '5',
                'Accept': 'application/json'
            }
        });
        res.json({
            success: true,
            username,
            friends: friendsResponse.data
        });
    }
    catch (error) {
        console.error('Xbox friends error:', error);
        const err = error;
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
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message
        });
    }
}));
// Get Xbox achievements for a specific title
app.get('/xbox/achievements/:username/:titleId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username, titleId } = req.params;
    try {
        const authorization = yield getAuthorizationHeader(username);
        const achievementsResponse = yield axios_1.default.get(`https://achievements.xboxlive.com/users/me/achievements?titleId=${titleId}&maxItems=1000`, {
            headers: {
                'Authorization': authorization,
                'x-xbl-contract-version': '4',
                'Accept': 'application/json'
            }
        });
        res.json({
            success: true,
            username,
            titleId,
            achievements: achievementsResponse.data
        });
    }
    catch (error) {
        console.error('Xbox achievements error:', error);
        const err = error;
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
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message
        });
    }
}));
// Get Xbox recent games
app.get('/xbox/games/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    try {
        const authorization = yield getAuthorizationHeader(username);
        const gamesResponse = yield axios_1.default.get(`https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail`, {
            headers: {
                'Authorization': authorization,
                'x-xbl-contract-version': '2',
                'Accept': 'application/json'
            }
        });
        res.json({
            success: true,
            username,
            games: gamesResponse.data
        });
    }
    catch (error) {
        console.error('Xbox games error:', error);
        const err = error;
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
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message
        });
    }
}));
// Get comprehensive Xbox status for a user (profile + presence + recent games)
app.get('/xbox/status/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username } = req.params;
    try {
        const authorization = yield getAuthorizationHeader(username);
        // Make multiple requests in parallel
        const [profileResponse, presenceResponse, gamesResponse] = yield Promise.allSettled([
            axios_1.default.get(`https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`, {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '3',
                    'Accept': 'application/json'
                }
            }),
            axios_1.default.get(`https://userpresence.xboxlive.com/users/me?level=all`, {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '3',
                    'Accept': 'application/json'
                }
            }),
            axios_1.default.get(`https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail`, {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '2',
                    'Accept': 'application/json'
                }
            })
        ]);
        const result = {
            success: true,
            username,
            timestamp: new Date().toISOString()
        };
        if (profileResponse.status === 'fulfilled') {
            result.profile = profileResponse.value.data;
        }
        else {
            result.profileError = profileResponse.reason.message;
        }
        if (presenceResponse.status === 'fulfilled') {
            result.presence = presenceResponse.value.data;
        }
        else {
            result.presenceError = presenceResponse.reason.message;
        }
        if (gamesResponse.status === 'fulfilled') {
            result.recentGames = gamesResponse.value.data;
        }
        else {
            result.gamesError = gamesResponse.reason.message;
        }
        res.json(result);
    }
    catch (error) {
        console.error('Xbox status error:', error);
        const err = error;
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
}));
// Get bulk status for all authenticated users
app.get('/xbox/status-all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authenticatedUsers = auth.getAuthenticatedUsers();
    if (authenticatedUsers.length === 0) {
        return res.json({
            success: true,
            message: 'No authenticated users',
            users: []
        });
    }
    const userStatusPromises = authenticatedUsers.map((username) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const authorization = yield getAuthorizationHeader(username);
            // Get basic profile and presence for each user
            const [profileResponse, presenceResponse] = yield Promise.allSettled([
                axios_1.default.get(`https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag`, {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                }),
                axios_1.default.get(`https://userpresence.xboxlive.com/users/me?level=all`, {
                    headers: {
                        'Authorization': authorization,
                        'x-xbl-contract-version': '3',
                        'Accept': 'application/json'
                    }
                })
            ]);
            const userStatus = {
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
        }
        catch (error) {
            return {
                username,
                authenticated: false,
                error: error.message
            };
        }
    }));
    const results = yield Promise.all(userStatusPromises);
    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        totalUsers: authenticatedUsers.length,
        users: results
    });
}));
let cache = { timestamp: 0, data: null };
app.get('/xbox/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const now = Date.now();
    // Use cache if recent (10 seconds)
    if (cache.data && now - cache.timestamp < 10000) {
        return res.json(cache.data);
    }
    const authenticatedUsers = auth.getAuthenticatedUsers();
    if (authenticatedUsers.length === 0) {
        const response = {
            success: true,
            activeGame: null,
            users: []
        };
        cache.data = response;
        cache.timestamp = now;
        return res.json(response);
    }
    // Pre-refresh tokens if needed
    for (const username of authenticatedUsers) {
        try {
            yield getAuthorizationHeader(username);
        }
        catch (error) {
            console.error(`Failed to prepare auth for ${username}:`, error);
        }
    }
    const userPresencePromises = authenticatedUsers.map((username) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const authorization = auth.getAuthorizationHeader(username);
            // Get stored gamertag (no API call needed!)
            const gamertag = auth.getStoredGamertag(username) || username;
            // Only get presence data - much faster!
            const presenceResponse = yield axios_1.default.get(`https://userpresence.xboxlive.com/users/me?level=all`, {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '3',
                    'Accept': 'application/json'
                },
                timeout: 5000
            });
            const presenceData = presenceResponse.data;
            // Add debug logging to see what's happening after Xbox restart
            console.log(`Raw presence data for ${username}:`, JSON.stringify(presenceData, null, 2));
            const devices = (presenceData === null || presenceData === void 0 ? void 0 : presenceData.devices) || [];
            // Find Xbox device with active game
            for (const device of devices) {
                const isXboxDevice = device.type === 'Scarlett' || device.type === 'XboxOne' ||
                    device.type === 'XboxSeriesX' || device.type === 'Xbox360' ||
                    device.type === 'XboxSeriesS';
                if (isXboxDevice) {
                    const titles = (device === null || device === void 0 ? void 0 : device.titles) || [];
                    // Look for active game (not Home)
                    for (const title of titles) {
                        if ((title === null || title === void 0 ? void 0 : title.placement) === 'Full' && (title === null || title === void 0 ? void 0 : title.state) === 'Active' && (title === null || title === void 0 ? void 0 : title.name) !== 'Home') {
                            return {
                                username,
                                gamertag: gamertag, // Use stored gamertag
                                currentGame: {
                                    id: title.id,
                                    name: title.name
                                }
                            };
                        }
                    }
                }
            }
            return null; // No active game found
        }
        catch (error) {
            console.error(`Error getting presence for ${username}:`, error);
            return null;
        }
    }));
    const userResults = yield Promise.all(userPresencePromises);
    const activeUsers = userResults.filter(user => user !== null);
    let activeGame = null;
    const usersInGame = [];
    if (activeUsers.length > 0) {
        // Use the first active user's game (assuming shared console)
        const firstUser = activeUsers[0];
        activeGame = {
            id: firstUser.currentGame.id,
            name: firstUser.currentGame.name,
            coverArtUrl: undefined
        };
        // Add all active users to the game
        activeUsers.forEach(user => {
            usersInGame.push({
                username: user.username,
                gamertag: user.gamertag
            });
        });
        // Try to get cover art (with error handling)
        try {
            const coverArtUrl = yield getGameCoverArt(activeGame.name);
            if (coverArtUrl) {
                activeGame.coverArtUrl = coverArtUrl;
            }
        }
        catch (error) {
            if (error instanceof Error) {
                console.error('Cover art service unavailable:', error.message);
            }
            else {
                console.error('Cover art service unavailable:', error);
            }
            // Continue without cover art - don't fail the whole request
        }
    }
    const response = {
        success: true,
        activeGame: activeGame,
        users: usersInGame
    };
    // Cache the response
    cache.data = response;
    cache.timestamp = now;
    res.json(response);
}));
// Get users playing a specific game
app.get('/xbox/game/:gameId/players', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
    const userPresencePromises = authenticatedUsers.map((username) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const authorization = yield getAuthorizationHeader(username);
            // Use stored gamertag instead of profile API call
            const gamertag = auth.getStoredGamertag(username) || username;
            const presenceResponse = yield axios_1.default.get(`https://userpresence.xboxlive.com/users/me?level=all`, {
                headers: {
                    'Authorization': authorization,
                    'x-xbl-contract-version': '3',
                    'Accept': 'application/json'
                }
            });
            const presenceData = presenceResponse.data;
            const devices = (presenceData === null || presenceData === void 0 ? void 0 : presenceData.devices) || [];
            for (const device of devices) {
                const titles = (device === null || device === void 0 ? void 0 : device.titles) || [];
                for (const title of titles) {
                    if ((title === null || title === void 0 ? void 0 : title.id) === gameId && (title === null || title === void 0 ? void 0 : title.placement) === 'Full' && (title === null || title === void 0 ? void 0 : title.state) === 'Active') {
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
            return null; // User not playing this game
        }
        catch (error) {
            return null;
        }
    }));
    const results = yield Promise.all(userPresencePromises);
    const playersInGame = results.filter(result => result !== null);
    res.json({
        success: true,
        gameId: gameId,
        gameName: playersInGame.length > 0 ? playersInGame[0].gameName : 'Unknown Game',
        playerCount: playersInGame.length,
        players: playersInGame,
        timestamp: new Date().toISOString()
    });
}));
// Health check
app.get('/health', (req, res) => {
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
function initializeServer() {
    return __awaiter(this, void 0, void 0, function* () {
        yield loadConfig();
        yield auth.loadTokens();
    });
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`Xbox Authentication API running on port ${PORT}`);
    console.log(`\nUsing Xbox Live client ID: 000000004C12AE6F`);
    console.log(`No Azure registration needed!`);
    // Initialize server configuration
    yield initializeServer();
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
    }
    else {
        console.log(`\n📝 Cover art disabled - add Giant Bomb API key to config.json to enable`);
    }
}));
exports.default = app;
