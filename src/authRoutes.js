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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth = __importStar(require("./auth"));
const router = (0, express_1.Router)();
router.post('/xbox/:username', (req, res) => {
    const { username } = req.params;
    try {
        const { authUrl, state } = auth.getAuthorizationUrl(username);
        res.json({
            success: true,
            message: `Authentication initiated for ${username}`,
            authUrl: authUrl,
            state: state,
            instructions: [
                `1. Visit the authUrl in your browser`,
                `2. Sign in with your Microsoft account`,
                `3. You'll be redirected to a page with a URL containing a 'code' parameter`,
                `4. Copy that code and use POST /auth/callback/${username} with the code`
            ],
            note: "This uses the working Xbox Live client ID - no Azure registration needed!"
        });
    }
    catch (error) {
        console.error('Auth URL generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate auth URL',
            details: error.message
        });
    }
});
router.post('/callback', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { code, state, error } = req.body;
    if (error) {
        return res.status(400).json({
            success: false,
            error: 'Authentication failed',
            details: error
        });
    }
    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'Missing authorization code'
        });
    }
    let username = 'default_user';
    if (state) {
        const validatedUsername = auth.validateState(state);
        if (validatedUsername) {
            username = validatedUsername;
        }
    }
    try {
        const tokens = yield auth.exchangeCodeForTokens(code, username);
        res.json({
            success: true,
            message: `Authentication successful for ${username}`,
            username: username,
            userHash: tokens.user_hash,
            tokenExpiry: new Date(tokens.expires_at).toISOString()
        });
    }
    catch (error) {
        console.error('Token exchange error:', error);
        const err = error;
        res.status(500).json({
            success: false,
            error: 'Token exchange failed',
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message || String(error)
        });
    }
}));
router.post('/callback/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    const { code, error } = req.body;
    if (error) {
        return res.status(400).json({
            success: false,
            error: 'Authentication failed',
            details: error
        });
    }
    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'Missing authorization code'
        });
    }
    try {
        const tokens = yield auth.exchangeCodeForTokens(code, username);
        res.json({
            success: true,
            message: `Authentication successful for ${username}`,
            username: username,
            userHash: tokens.user_hash,
            tokenExpiry: new Date(tokens.expires_at).toISOString()
        });
    }
    catch (error) {
        console.error('Token exchange error:', error);
        const err = error;
        res.status(500).json({
            success: false,
            error: 'Token exchange failed',
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message || String(error)
        });
    }
}));
router.post('/token/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    const { access_token, refresh_token, expires_in } = req.body;
    if (!access_token) {
        return res.status(400).json({
            success: false,
            error: 'Missing access_token in request body'
        });
    }
    try {
        const tokens = yield auth.storeDirectTokens(username, access_token, refresh_token, expires_in);
        res.json({
            success: true,
            message: `Direct token authentication successful for ${username}`,
            username: username,
            userHash: tokens.user_hash,
            tokenExpiry: new Date(tokens.expires_at).toISOString()
        });
    }
    catch (error) {
        console.error('Direct token authentication error:', error);
        const err = error;
        res.status(500).json({
            success: false,
            error: 'Direct token authentication failed',
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message || String(error)
        });
    }
}));
// Get stored tokens for a user
router.get('/tokens/:username', (req, res) => {
    const { username } = req.params;
    const tokens = auth.getTokens(username);
    if (!tokens) {
        return res.status(404).json({
            success: false,
            error: `No tokens found for user: ${username}`,
            message: 'User needs to authenticate first'
        });
    }
    // Check if token is expired
    const isExpired = Date.now() > tokens.expires_at;
    res.json({
        success: true,
        username: username,
        userHash: tokens.user_hash,
        hasValidToken: !isExpired,
        tokenExpiry: new Date(tokens.expires_at).toISOString(),
        lastAuthenticated: new Date(tokens.timestamp).toISOString()
    });
});
// Refresh token endpoint
router.post('/refresh/:username', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username } = req.params;
    try {
        const updatedTokens = yield auth.refreshTokens(username);
        res.json({
            success: true,
            message: `Tokens refreshed for ${username}`,
            tokenExpiry: new Date(updatedTokens.expires_at).toISOString()
        });
    }
    catch (error) {
        console.error('Token refresh error:', error);
        const err = error;
        if (err.message.includes('No refresh token')) {
            return res.status(404).json({
                success: false,
                error: err.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Token refresh failed',
            details: ((_a = err.response) === null || _a === void 0 ? void 0 : _a.data) || err.message || String(error)
        });
    }
}));
// Get authorization header for Xbox API calls
router.get('/header/:username', (req, res) => {
    const { username } = req.params;
    try {
        const authorization = auth.getAuthorizationHeader(username);
        const tokens = auth.getTokens(username);
        res.json({
            success: true,
            authorization: authorization,
            userHash: tokens.user_hash,
            username: username
        });
    }
    catch (error) {
        const err = error;
        if (err.message.includes('No tokens')) {
            return res.status(404).json({
                success: false,
                error: err.message
            });
        }
        if (err.message.includes('Token expired')) {
            return res.status(401).json({
                success: false,
                error: err.message,
                message: 'Use /auth/refresh/:username to refresh the token'
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to get authorization header',
            details: err.message
        });
    }
});
// Get authentication status
router.get('/status/:username', (req, res) => {
    const { username } = req.params;
    const tokens = auth.getTokens(username);
    if (tokens) {
        const isExpired = Date.now() > tokens.expires_at;
        return res.json({
            status: isExpired ? 'expired' : 'authenticated',
            hasTokens: true,
            isExpired,
            username,
            userHash: tokens.user_hash,
            tokenExpiry: new Date(tokens.expires_at).toISOString()
        });
    }
    res.json({
        status: 'not_started',
        hasTokens: false,
        username
    });
});
// Helper endpoint to get the authorization URL
router.get('/url/:username', (req, res) => {
    const { username } = req.params;
    try {
        const { authUrl, state } = auth.getAuthorizationUrl(username);
        res.json({
            success: true,
            authUrl: authUrl,
            state: state,
            clientId: '000000004C12AE6F',
            redirectUri: 'https://login.live.com/oauth20_desktop.srf',
            scope: 'XboxLive.signin offline_access',
            instructions: [
                "1. Visit the authUrl in your browser",
                "2. Sign in with your Microsoft account",
                "3. After redirect, extract 'code' from URL",
                "4. POST to /auth/callback/:username with code (recommended)",
                "5. Or POST to /auth/callback with code and state"
            ]
        });
    }
    catch (error) {
        console.error('Auth URL generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate auth URL',
            details: error.message
        });
    }
});
exports.default = router;
