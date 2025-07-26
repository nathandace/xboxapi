import axios from 'axios';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

// Type definitions
export interface TokenData {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    xbl_token: string;
    xsts_token: string;
    user_hash: string;
    gamertag?: string; // Added gamertag storage
    timestamp: number;
    username: string;
}

export interface StateData {
    username: string;
    timestamp: number;
}

interface Config {
    clientId: string;
    redirectUri: string;
    scopes: string;
    authorizeEndpoint: string;
    tokenEndpoint: string;
}

// Configuration - Using working Xbox Live client ID with consumers endpoint
const config: Config = {
    clientId: '000000004C12AE6F',
    redirectUri: 'https://login.live.com/oauth20_desktop.srf',
    scopes: 'XboxLive.signin offline_access',
    authorizeEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
};

// In-memory storage (use a database in production)
const tokenStorage = new Map<string, TokenData>();
const stateStorage = new Map<string, StateData>();

// Store tokens securely (in production, use encrypted database storage)
export async function storeTokens(username: string, tokens: Omit<TokenData, 'timestamp' | 'username'>): Promise<void> {
    const tokenData: TokenData = {
        ...tokens,
        timestamp: Date.now(),
        username: username
    };

    tokenStorage.set(username, tokenData);

    // Optional: persist to file (encrypt in production)
    try {
        await fs.writeFile(
            path.join(__dirname, 'tokens.json'),
            JSON.stringify(Object.fromEntries(tokenStorage), null, 2)
        );
    } catch (error) {
        console.error('Error saving tokens:', error);
    }
}

// Load tokens on startup
export async function loadTokens(): Promise<void> {
    try {
        const data = await fs.readFile(path.join(__dirname, 'tokens.json'), 'utf8');
        const tokens = JSON.parse(data);
        for (const [username, tokenData] of Object.entries(tokens)) {
            tokenStorage.set(username, tokenData as TokenData);
        }
        console.log('Loaded existing tokens for', Object.keys(tokens).length, 'users');
    } catch (error) {
        console.log('No existing tokens file found, starting fresh');
    }
}

// Enhanced Xbox token exchange with gamertag capture
export async function getXboxTokensWithGamertag(accessToken: string): Promise<{
    xblToken: string;
    xstsToken: string;
    userHash: string;
    gamertag?: string
}> {
    try {
        // Authenticate with Xbox Live - note the RpsTicket format for modern endpoint
        const xblResponse = await axios.post(
            'https://user.auth.xboxlive.com/user/authenticate',
            {
                Properties: {
                    AuthMethod: 'RPS',
                    SiteName: 'user.auth.xboxlive.com',
                    RpsTicket: `d=${accessToken}` // Note: 'd=' prefix required for modern flow
                },
                RelyingParty: 'http://auth.xboxlive.com',
                TokenType: 'JWT'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );

        const xblData = xblResponse.data as {
            Token: string;
            DisplayClaims: { xui: { uhs: string; gtg?: string }[] };
        };
        const xblToken = xblData.Token;
        const userHash = xblData.DisplayClaims.xui[0].uhs;

        // Try to extract gamertag from XBL response (sometimes included)
        let gamertag = xblData.DisplayClaims.xui[0].gtg;

        // Get XSTS token
        const xstsResponse = await axios.post(
            'https://xsts.auth.xboxlive.com/xsts/authorize',
            {
                Properties: {
                    SandboxId: 'RETAIL',
                    UserTokens: [xblToken]
                },
                RelyingParty: 'http://xboxlive.com',
                TokenType: 'JWT'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );

        const xstsData = xstsResponse.data as {
            Token: string;
            DisplayClaims?: { xui?: { gtg?: string }[] };
        };
        const xstsToken = xstsData.Token;

        // Try to get gamertag from XSTS response if not found in XBL
        if (!gamertag && xstsData.DisplayClaims?.xui?.[0]?.gtg) {
            gamertag = xstsData.DisplayClaims.xui[0].gtg;
        }

        // If we still don't have gamertag, try one quick profile call
        if (!gamertag) {
            try {
                const profileResponse = await axios.get(
                    'https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag',
                    {
                        headers: {
                            'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
                            'x-xbl-contract-version': '3',
                            'Accept': 'application/json'
                        },
                        timeout: 5000
                    }
                );

                const profileData = profileResponse.data as { profileUsers?: { settings?: { id: string; value: string }[] }[] };
                if (profileData?.profileUsers?.[0]?.settings) {
                    const gamertagSetting = profileData.profileUsers[0].settings.find((s: any) =>
                        s.id === 'ModernGamertag' || s.id === 'Gamertag'
                    );
                    if (gamertagSetting?.value) {
                        gamertag = gamertagSetting.value;
                    }
                }
            } catch (profileError) {
                console.warn('Could not fetch gamertag during auth, will use username as fallback');
            }
        }

        return { xblToken, xstsToken, userHash, gamertag };
    } catch (error) {
        const err = error as any;
        console.error('Xbox token exchange error:', err.response?.data || err.message);
        throw new Error(`Xbox authentication failed: ${err.response?.data?.Message || err.message}`);
    }
}

// Generate state parameter for OAuth security
export function generateState(): string {
    return crypto.randomBytes(16).toString('hex');
}

// Get authorization URL for a user
export function getAuthorizationUrl(username: string): { authUrl: string; state: string } {
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
export async function exchangeCodeForTokens(code: string, username: string): Promise<TokenData> {
    const tokenResponse = await axios.post<{ access_token: string; refresh_token: string; expires_in: number }>(
        config.tokenEndpoint,
        new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            code: code,
            redirect_uri: config.redirectUri
            // Note: No client_secret needed for this client ID
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Get Xbox tokens AND gamertag
    const { xblToken, xstsToken, userHash, gamertag } = await getXboxTokensWithGamertag(access_token);

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

    await storeTokens(username, tokens);

    return {
        ...tokens,
        timestamp: Date.now(),
        username
    };
}

// Refresh tokens for a user
export async function refreshTokens(username: string): Promise<TokenData> {
    const tokens = tokenStorage.get(username);

    if (!tokens || !tokens.refresh_token) {
        throw new Error('No refresh token available for user');
    }

    console.log(`Attempting to refresh tokens for ${username}...`);

    try {
        const tokenResponse = await axios.post<{ access_token: string; refresh_token: string; expires_in: number }>(
            config.tokenEndpoint,
            new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: config.clientId,
                refresh_token: tokens.refresh_token
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000 // 10 second timeout
            }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // IMPORTANT: Get fresh Xbox Live tokens with the new access token
        const { xblToken, xstsToken, userHash, gamertag } = await getXboxTokensWithGamertag(access_token);

        // Update stored tokens with fresh Xbox tokens
        const updatedTokens = {
            access_token,
            refresh_token: refresh_token || tokens.refresh_token,
            expires_in,
            expires_at: Date.now() + (expires_in * 1000),
            xbl_token: xblToken,      // Fresh XBL token
            xsts_token: xstsToken,    // Fresh XSTS token
            user_hash: userHash,      // Fresh user hash
            gamertag: gamertag || tokens.gamertag || username, // Preserve or update gamertag
            timestamp: Date.now(),
            username: tokens.username
        };

        await storeTokens(username, updatedTokens);
        console.log(`Successfully refreshed all tokens for ${username}`);

        return updatedTokens;

    } catch (error) {
        console.error(`Token refresh failed for ${username}:`, error);
        throw error;
    }
}

// Get tokens for a user
export function getTokens(username: string): TokenData | undefined {
    return tokenStorage.get(username);
}

// Get authorization header for Xbox API calls
export function getAuthorizationHeader(username: string): string {
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
export function getStoredGamertag(username: string): string | undefined {
    const tokens = tokenStorage.get(username);
    return tokens?.gamertag;
}

// Get all authenticated users
export function getAuthenticatedUsers(): string[] {
    return Array.from(tokenStorage.keys());
}

// Get authentication statistics
export function getAuthStats() {
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
export function validateState(state: string): string | null {
    const stateData = stateStorage.get(state);
    if (!stateData) {
        return null;
    }

    stateStorage.delete(state);
    return stateData.username;
}

// Store tokens directly (for direct token flow)
export async function storeDirectTokens(username: string, access_token: string, refresh_token?: string, expires_in?: number): Promise<TokenData> {
    const { xblToken, xstsToken, userHash, gamertag } = await getXboxTokensWithGamertag(access_token);

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

    await storeTokens(username, tokens);

    return {
        ...tokens,
        timestamp: Date.now(),
        username
    };
}

// Remove user tokens
export async function removeUser(username: string): Promise<boolean> {
    try {
        const exists = tokenStorage.has(username);
        if (exists) {
            tokenStorage.delete(username);

            // Update the tokens file
            await fs.writeFile(
                path.join(__dirname, 'tokens.json'),
                JSON.stringify(Object.fromEntries(tokenStorage), null, 2)
            );

            console.log(`Removed user: ${username}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing user:', error);
        return false;
    }
}