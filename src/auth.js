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
exports.storeTokens = storeTokens;
exports.loadTokens = loadTokens;
exports.getXboxTokensWithGamertag = getXboxTokensWithGamertag;
exports.generateState = generateState;
exports.getAuthorizationUrl = getAuthorizationUrl;
exports.exchangeCodeForTokens = exchangeCodeForTokens;
exports.refreshTokens = refreshTokens;
exports.getTokens = getTokens;
exports.getAuthorizationHeader = getAuthorizationHeader;
exports.getStoredGamertag = getStoredGamertag;
exports.getAuthenticatedUsers = getAuthenticatedUsers;
exports.getAuthStats = getAuthStats;
exports.validateState = validateState;
exports.storeDirectTokens = storeDirectTokens;
exports.removeUser = removeUser;
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
// Configuration - Using working Xbox Live client ID with consumers endpoint
const config = {
    clientId: '000000004C12AE6F',
    redirectUri: 'https://login.live.com/oauth20_desktop.srf',
    scopes: 'XboxLive.signin offline_access',
    authorizeEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
};
// In-memory storage (use a database in production)
const tokenStorage = new Map();
const stateStorage = new Map();
// Store tokens securely (in production, use encrypted database storage)
function storeTokens(username, tokens) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenData = Object.assign(Object.assign({}, tokens), { timestamp: Date.now(), username: username });
        tokenStorage.set(username, tokenData);
        // Optional: persist to file (encrypt in production)
        try {
            yield fs_1.promises.writeFile(path.join(__dirname, 'tokens.json'), JSON.stringify(Object.fromEntries(tokenStorage), null, 2));
        }
        catch (error) {
            console.error('Error saving tokens:', error);
        }
    });
}
// Load tokens on startup
function loadTokens() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = yield fs_1.promises.readFile(path.join(__dirname, 'tokens.json'), 'utf8');
            const tokens = JSON.parse(data);
            for (const [username, tokenData] of Object.entries(tokens)) {
                tokenStorage.set(username, tokenData);
            }
            console.log('Loaded existing tokens for', Object.keys(tokens).length, 'users');
        }
        catch (error) {
            console.log('No existing tokens file found, starting fresh');
        }
    });
}
// Enhanced Xbox token exchange with gamertag capture
function getXboxTokensWithGamertag(accessToken) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            // Authenticate with Xbox Live - note the RpsTicket format for modern endpoint
            const xblResponse = yield axios_1.default.post('https://user.auth.xboxlive.com/user/authenticate', {
                Properties: {
                    AuthMethod: 'RPS',
                    SiteName: 'user.auth.xboxlive.com',
                    RpsTicket: `d=${accessToken}` // Note: 'd=' prefix required for modern flow
                },
                RelyingParty: 'http://auth.xboxlive.com',
                TokenType: 'JWT'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            const xblData = xblResponse.data;
            const xblToken = xblData.Token;
            const userHash = xblData.DisplayClaims.xui[0].uhs;
            // Try to extract gamertag from XBL response (sometimes included)
            let gamertag = xblData.DisplayClaims.xui[0].gtg;
            // Get XSTS token
            const xstsResponse = yield axios_1.default.post('https://xsts.auth.xboxlive.com/xsts/authorize', {
                Properties: {
                    SandboxId: 'RETAIL',
                    UserTokens: [xblToken]
                },
                RelyingParty: 'http://xboxlive.com',
                TokenType: 'JWT'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            const xstsData = xstsResponse.data;
            const xstsToken = xstsData.Token;
            // Try to get gamertag from XSTS response if not found in XBL
            if (!gamertag && ((_c = (_b = (_a = xstsData.DisplayClaims) === null || _a === void 0 ? void 0 : _a.xui) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.gtg)) {
                gamertag = xstsData.DisplayClaims.xui[0].gtg;
            }
            // If we still don't have gamertag, try one quick profile call
            if (!gamertag) {
                try {
                    const profileResponse = yield axios_1.default.get('https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag', {
                        headers: {
                            'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        },
                        timeout: 5000
                    });
                    const profileData = profileResponse.data;
                    if ((_e = (_d = profileData === null || profileData === void 0 ? void 0 : profileData.profileUsers) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.settings) {
                        const gamertagSetting = profileData.profileUsers[0].settings.find((s) => s.id === 'ModernGamertag' || s.id === 'Gamertag');
                        if (gamertagSetting === null || gamertagSetting === void 0 ? void 0 : gamertagSetting.value) {
                            gamertag = gamertagSetting.value;
                        }
                    }
                }
                catch (profileError) {
                    console.warn('Could not fetch gamertag during auth, will use username as fallback');
                }
            }
            return { xblToken, xstsToken, userHash, gamertag };
        }
        catch (error) {
            const err = error;
            console.error('Xbox token exchange error:', ((_f = err.response) === null || _f === void 0 ? void 0 : _f.data) || err.message);
            throw new Error(`Xbox authentication failed: ${((_h = (_g = err.response) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h.Message) || err.message}`);
        }
    });
}
// Generate state parameter for OAuth security
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}
// Get authorization URL for a user
function getAuthorizationUrl(username) {
    const state = generateState();
    // Store state temporarily
    stateStorage.set(state, {
        username,
        timestamp: Date.now()
    });
    // Clean up expired states (older than 10 minutes)
    for (const [key, value] of stateStorage.entries()) {
        if (Date.now() - value.timestamp > 10 * 60 * 1000) {
            stateStorage.delete(key);
        }
    }
    // Build authorization URL
    const authUrl = `${config.authorizeEndpoint}?` +
        `client_id=${config.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
        `scope=${encodeURIComponent(config.scopes)}&` +
        `response_type=code&` +
        `state=${state}&` +
        `display=touch&` +
        `locale=en`;
    return { authUrl, state };
}
// Exchange authorization code for tokens
function exchangeCodeForTokens(code, username) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenResponse = yield axios_1.default.post(config.tokenEndpoint, new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            code: code,
            redirect_uri: config.redirectUri
            // Note: No client_secret needed for this client ID
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        // Get Xbox tokens AND gamertag
        const { xblToken, xstsToken, userHash, gamertag } = yield getXboxTokensWithGamertag(access_token);
        // Store all tokens including gamertag
        const tokens = {
            access_token,
            refresh_token,
            expires_in,
            expires_at: Date.now() + (expires_in * 1000),
            xbl_token: xblToken,
            xsts_token: xstsToken,
            user_hash: userHash,
            gamertag: gamertag || username // Fallback to username if gamertag not found
        };
        yield storeTokens(username, tokens);
        return Object.assign(Object.assign({}, tokens), { timestamp: Date.now(), username });
    });
}
// Refresh tokens for a user
function refreshTokens(username) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokens = tokenStorage.get(username);
        if (!tokens || !tokens.refresh_token) {
            throw new Error('No refresh token available for user');
        }
        console.log(`Attempting to refresh tokens for ${username}...`);
        try {
            const tokenResponse = yield axios_1.default.post(config.tokenEndpoint, new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: config.clientId,
                refresh_token: tokens.refresh_token
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000 // 10 second timeout
            });
            const { access_token, refresh_token, expires_in } = tokenResponse.data;
            // IMPORTANT: Get fresh Xbox Live tokens with the new access token
            const { xblToken, xstsToken, userHash, gamertag } = yield getXboxTokensWithGamertag(access_token);
            // Update stored tokens with fresh Xbox tokens
            const updatedTokens = {
                access_token,
                refresh_token: refresh_token || tokens.refresh_token,
                expires_in,
                expires_at: Date.now() + (expires_in * 1000),
                xbl_token: xblToken, // Fresh XBL token
                xsts_token: xstsToken, // Fresh XSTS token
                user_hash: userHash, // Fresh user hash
                gamertag: gamertag || tokens.gamertag || username, // Preserve or update gamertag
                timestamp: Date.now(),
                username: tokens.username
            };
            yield storeTokens(username, updatedTokens);
            console.log(`Successfully refreshed all tokens for ${username}`);
            return updatedTokens;
        }
        catch (error) {
            console.error(`Token refresh failed for ${username}:`, error);
            throw error;
        }
    });
}
// Get tokens for a user
function getTokens(username) {
    return tokenStorage.get(username);
}
// Get authorization header for Xbox API calls
function getAuthorizationHeader(username) {
    const tokens = tokenStorage.get(username);
    if (!tokens) {
        throw new Error(`No tokens found for user: ${username}`);
    }
    if (Date.now() > tokens.expires_at) {
        throw new Error('Token expired - please refresh or re-authenticate');
    }
    return `XBL3.0 x=${tokens.user_hash};${tokens.xsts_token}`;
}
// Get stored gamertag for a user (NEW FUNCTION)
function getStoredGamertag(username) {
    const tokens = tokenStorage.get(username);
    return tokens === null || tokens === void 0 ? void 0 : tokens.gamertag;
}
// Get all authenticated users
function getAuthenticatedUsers() {
    return Array.from(tokenStorage.keys());
}
// Get authentication statistics
function getAuthStats() {
    const users = Array.from(tokenStorage.values());
    const validTokens = users.filter(token => Date.now() <= token.expires_at);
    const expiredTokens = users.filter(token => Date.now() > token.expires_at);
    return {
        totalUsers: users.length,
        validTokens: validTokens.length,
        expiredTokens: expiredTokens.length,
        pendingStates: stateStorage.size
    };
}
// Validate state parameter and get username
function validateState(state) {
    const stateData = stateStorage.get(state);
    if (!stateData) {
        return null;
    }
    stateStorage.delete(state);
    return stateData.username;
}
// Store tokens directly (for direct token flow)
function storeDirectTokens(username, access_token, refresh_token, expires_in) {
    return __awaiter(this, void 0, void 0, function* () {
        const { xblToken, xstsToken, userHash, gamertag } = yield getXboxTokensWithGamertag(access_token);
        const tokens = {
            access_token,
            refresh_token: refresh_token || '',
            expires_in: expires_in || 86400,
            expires_at: Date.now() + ((expires_in || 86400) * 1000),
            xbl_token: xblToken,
            xsts_token: xstsToken,
            user_hash: userHash,
            gamertag: gamertag || username // Fallback to username if gamertag not found
        };
        yield storeTokens(username, tokens);
        return Object.assign(Object.assign({}, tokens), { timestamp: Date.now(), username });
    });
}
// Remove user tokens
function removeUser(username) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const exists = tokenStorage.has(username);
            if (exists) {
                tokenStorage.delete(username);
                // Update the tokens file
                yield fs_1.promises.writeFile(path.join(__dirname, 'tokens.json'), JSON.stringify(Object.fromEntries(tokenStorage), null, 2));
                console.log(`Removed user: ${username}`);
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('Error removing user:', error);
            return false;
        }
    });
}
