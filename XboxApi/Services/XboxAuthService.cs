using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Web;
using XboxApi.Models;

namespace XboxApi.Services;

public class XboxAuthService : IXboxAuthService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<XboxAuthService> _logger;
    private readonly string _tokensFilePath;
    private readonly ConcurrentDictionary<string, XboxTokenData> _tokenStorage = new();
    private readonly ConcurrentDictionary<string, StateData> _stateStorage = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _refreshSemaphores = new();

    /// <summary>
    /// Initializes a new instance of the XboxAuthService class
    /// </summary>
    /// <param name="httpClientFactory">Factory for creating HTTP clients</param>
    /// <param name="logger">Logger instance for this service</param>
    public XboxAuthService(IHttpClientFactory httpClientFactory, ILogger<XboxAuthService> logger)
    {
        _httpClient = httpClientFactory.CreateClient("XboxAuthClient");
        _logger = logger;
        _tokensFilePath = Path.Combine(Directory.GetCurrentDirectory(), "tokens.json");
    }

    /// <summary>
    /// Generates an authorization URL for Xbox Live authentication
    /// </summary>
    /// <param name="username">The username to authenticate</param>
    /// <returns>Authorization URL for Microsoft OAuth</returns>
    public Task<string> GetAuthorizationUrlAsync(string username)
    {
        var state = Guid.NewGuid().ToString();
        var stateData = new StateData
        {
            Username = username,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        _stateStorage[state] = stateData;

        var queryParams = HttpUtility.ParseQueryString(string.Empty);
        queryParams["client_id"] = XboxApiConfig.ClientId;
        queryParams["response_type"] = "code";
        queryParams["redirect_uri"] = XboxApiConfig.RedirectUri;
        queryParams["scope"] = XboxApiConfig.Scopes;
        queryParams["state"] = state;

        var authUrl = $"{XboxApiConfig.AuthorizeEndpoint}?{queryParams}";
        
        return Task.FromResult(authUrl);
    }

    /// <summary>
    /// Exchanges an authorization code for Xbox Live tokens
    /// </summary>
    /// <param name="code">Authorization code from Microsoft OAuth</param>
    /// <param name="state">State parameter for security validation</param>
    /// <returns>Xbox token data including access and refresh tokens</returns>
    public async Task<XboxTokenData> ExchangeCodeForTokensAsync(string code, string state)
    {
        if (!_stateStorage.TryGetValue(state, out var stateData) || stateData.IsExpired)
        {
            throw new InvalidOperationException("Invalid or expired state parameter");
        }

        var username = stateData.Username;
        _stateStorage.TryRemove(state, out _);


        // Exchange code for Microsoft tokens
        var tokenResponse = await ExchangeCodeForMicrosoftTokenAsync(code);
        
        // Get Xbox Live tokens
        var xblToken = await GetXboxLiveTokenAsync(tokenResponse.AccessToken);
        var xstsToken = await GetXstsTokenAsync(xblToken);
        
        // Get user info and gamertag
        var userInfo = await GetUserInfoAsync(xstsToken.Token, xstsToken.UserHash);

        _logger.LogInformation("Successfully authenticated {Username} with gamertag {Gamertag}", username, userInfo.Gamertag);

        var tokenData = new XboxTokenData
        {
            AccessToken = tokenResponse.AccessToken,
            RefreshToken = tokenResponse.RefreshToken,
            ExpiresIn = tokenResponse.ExpiresIn,
            ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(tokenResponse.ExpiresIn).ToUnixTimeMilliseconds(),
            XblToken = xblToken,
            XstsToken = xstsToken.Token,
            UserHash = xstsToken.UserHash,
            Gamertag = userInfo.Gamertag,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Username = username
        };


        _tokenStorage[username] = tokenData;
        await SaveTokensAsync();


        return tokenData;
    }

    /// <summary>
    /// Refreshes expired Xbox Live tokens for a user
    /// </summary>
    /// <param name="username">The username to refresh tokens for</param>
    /// <returns>Refreshed Xbox token data</returns>
    public async Task<XboxTokenData> RefreshTokensAsync(string username)
    {
        var semaphore = _refreshSemaphores.GetOrAdd(username, _ => new SemaphoreSlim(1, 1));
        
        await semaphore.WaitAsync();
        try
        {
            if (!_tokenStorage.TryGetValue(username, out var currentTokens))
            {
                throw new InvalidOperationException($"No tokens found for user: {username}");
            }

            // Check if tokens were already refreshed by another thread
            if (!currentTokens.IsExpiringSoon)
            {
                return currentTokens;
            }


            _logger.LogInformation("Refreshing tokens for {Username}", username);
            var tokenResponse = await RefreshMicrosoftTokenAsync(currentTokens.RefreshToken);
            
            var xblToken = await GetXboxLiveTokenAsync(tokenResponse.AccessToken);
            var xstsToken = await GetXstsTokenAsync(xblToken);

            var refreshedTokens = new XboxTokenData
            {
                AccessToken = tokenResponse.AccessToken,
                RefreshToken = tokenResponse.RefreshToken,
                ExpiresIn = tokenResponse.ExpiresIn,
                ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(tokenResponse.ExpiresIn).ToUnixTimeMilliseconds(),
                XblToken = xblToken,
                XstsToken = xstsToken.Token,
                UserHash = xstsToken.UserHash,
                Gamertag = currentTokens.Gamertag,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Username = username
            };

            _tokenStorage[username] = refreshedTokens;
            await SaveTokensAsync();

            _logger.LogInformation("Successfully refreshed tokens for {Username}", username);
            return refreshedTokens;
        }
        finally
        {
            semaphore.Release();
        }
    }

    /// <summary>
    /// Retrieves stored tokens for a user
    /// </summary>
    /// <param name="username">The username to get tokens for</param>
    /// <returns>Xbox token data if found, null otherwise</returns>
    public Task<XboxTokenData?> GetTokensAsync(string username)
    {
        _tokenStorage.TryGetValue(username, out var tokens);
        return Task.FromResult(tokens);
    }

    /// <summary>
    /// Removes a user's authentication tokens
    /// </summary>
    /// <param name="username">The username to remove</param>
    /// <returns>True if user was removed, false if not found</returns>
    public async Task<bool> RemoveUserAsync(string username)
    {
        var removed = _tokenStorage.TryRemove(username, out _);
        if (removed)
        {
            await SaveTokensAsync();
            _logger.LogInformation("Removed user {Username}", username);
        }
        return removed;
    }

    /// <summary>
    /// Gets a list of all authenticated usernames
    /// </summary>
    /// <returns>List of authenticated usernames</returns>
    public Task<List<string>> GetAuthenticatedUsersAsync()
    {
        var users = _tokenStorage.Keys.ToList();
        return Task.FromResult(users);
    }

    /// <summary>
    /// Retrieves the stored gamertag for a user
    /// </summary>
    /// <param name="username">The username to get gamertag for</param>
    /// <returns>Gamertag if found, null otherwise</returns>
    public Task<string?> GetStoredGamertagAsync(string username)
    {
        _tokenStorage.TryGetValue(username, out var tokens);
        return Task.FromResult(tokens?.Gamertag);
    }

    /// <summary>
    /// Loads authentication tokens from persistent storage
    /// </summary>
    public async Task LoadTokensAsync()
    {
        try
        {
            if (!File.Exists(_tokensFilePath))
            {
                return;
            }

            var json = await File.ReadAllTextAsync(_tokensFilePath);
            
            var tokens = JsonSerializer.Deserialize<Dictionary<string, XboxTokenData>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (tokens != null)
            {
                foreach (var kvp in tokens)
                {
                    _tokenStorage[kvp.Key] = kvp.Value;
                }
                _logger.LogInformation("Loaded tokens for {UserCount} users", tokens.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load tokens from file: {Message}", ex.Message);
        }
    }

    /// <summary>
    /// Saves authentication tokens to persistent storage
    /// </summary>
    public async Task SaveTokensAsync()
    {
        try
        {
            var tokens = _tokenStorage.ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
            var json = JsonSerializer.Serialize(tokens, new JsonSerializerOptions 
            { 
                WriteIndented = true 
            });
            
            await File.WriteAllTextAsync(_tokensFilePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save tokens to file");
        }
    }

    /// <summary>
    /// Gets authentication statistics for all users
    /// </summary>
    /// <returns>Tuple containing total users, expired tokens, and valid tokens counts</returns>
    public (int totalUsers, int expiredTokens, int validTokens) GetAuthStats()
    {
        var totalUsers = _tokenStorage.Count;
        var expiredTokens = _tokenStorage.Values.Count(t => t.IsExpired);
        var validTokens = totalUsers - expiredTokens;
        
        return (totalUsers, expiredTokens, validTokens);
    }

    // Private helper methods
    /// <summary>
    /// Exchanges authorization code for Microsoft access tokens
    /// </summary>
    /// <param name="code">The authorization code from Microsoft OAuth</param>
    /// <returns>Microsoft token response containing access and refresh tokens</returns>
    private async Task<MicrosoftTokenResponse> ExchangeCodeForMicrosoftTokenAsync(string code)
    {
        var formData = new List<KeyValuePair<string, string>>
        {
            new("client_id", XboxApiConfig.ClientId),
            new("code", code),
            new("grant_type", "authorization_code"),
            new("redirect_uri", XboxApiConfig.RedirectUri),
            new("scope", XboxApiConfig.Scopes)
        };

        var response = await _httpClient.PostAsync(XboxApiConfig.TokenEndpoint, 
            new FormUrlEncodedContent(formData));

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        
        return JsonSerializer.Deserialize<MicrosoftTokenResponse>(json) 
            ?? throw new InvalidOperationException("Failed to deserialize token response");
    }

    /// <summary>
    /// Refreshes Microsoft access tokens using a refresh token
    /// </summary>
    /// <param name="refreshToken">The refresh token to use</param>
    /// <returns>New Microsoft token response</returns>
    private async Task<MicrosoftTokenResponse> RefreshMicrosoftTokenAsync(string refreshToken)
    {
        var formData = new List<KeyValuePair<string, string>>
        {
            new("client_id", XboxApiConfig.ClientId),
            new("refresh_token", refreshToken),
            new("grant_type", "refresh_token"),
            new("scope", XboxApiConfig.Scopes)
        };

        var response = await _httpClient.PostAsync(XboxApiConfig.TokenEndpoint, 
            new FormUrlEncodedContent(formData));

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        
        return JsonSerializer.Deserialize<MicrosoftTokenResponse>(json) 
            ?? throw new InvalidOperationException("Failed to deserialize refresh token response");
    }

    /// <summary>
    /// Exchanges Microsoft access token for Xbox Live token
    /// </summary>
    /// <param name="accessToken">Microsoft access token</param>
    /// <returns>Xbox Live authentication token</returns>
    private async Task<string> GetXboxLiveTokenAsync(string accessToken)
    {
        var xblRequest = new
        {
            Properties = new
            {
                AuthMethod = "RPS",
                SiteName = "user.auth.xboxlive.com",
                RpsTicket = $"d={accessToken}"
            },
            RelyingParty = "http://auth.xboxlive.com",
            TokenType = "JWT"
        };

        var content = new StringContent(JsonSerializer.Serialize(xblRequest), 
            Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("https://user.auth.xboxlive.com/user/authenticate", content);
        response.EnsureSuccessStatusCode();
        
        var json = await response.Content.ReadAsStringAsync();
        var xblResponse = JsonSerializer.Deserialize<XboxLiveTokenResponse>(json);
        
        return xblResponse?.Token ?? throw new InvalidOperationException("Failed to get Xbox Live token");
    }

    /// <summary>
    /// Exchanges Xbox Live token for XSTS token
    /// </summary>
    /// <param name="xblToken">Xbox Live token</param>
    /// <returns>XSTS token response containing token and user hash</returns>
    private async Task<XstsTokenResponse> GetXstsTokenAsync(string xblToken)
    {
        var xstsRequest = new
        {
            Properties = new
            {
                SandboxId = "RETAIL",
                UserTokens = new[] { xblToken }
            },
            RelyingParty = "http://xboxlive.com",
            TokenType = "JWT"
        };

        var content = new StringContent(JsonSerializer.Serialize(xstsRequest), 
            Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("https://xsts.auth.xboxlive.com/xsts/authorize", content);
        response.EnsureSuccessStatusCode();
        
        var json = await response.Content.ReadAsStringAsync();
        var xstsResponse = JsonSerializer.Deserialize<XstsTokenResponseRaw>(json);
        
        if (xstsResponse?.DisplayClaims?.Xui?.Any() != true)
        {
            throw new InvalidOperationException("Failed to get XSTS token - no user claims");
        }

        return new XstsTokenResponse
        {
            Token = xstsResponse.Token,
            UserHash = xstsResponse.DisplayClaims.Xui[0].Uhs
        };
    }

    /// <summary>
    /// Retrieves user information including gamertag using XSTS token
    /// </summary>
    /// <param name="xstsToken">XSTS authentication token</param>
    /// <param name="userHash">User hash from XSTS token</param>
    /// <returns>User information including gamertag</returns>
    private async Task<UserInfo> GetUserInfoAsync(string xstsToken, string userHash)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, 
            "https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,ModernGamertag");
        
        var authHeader = $"XBL3.0 x={userHash};{xstsToken}";
        request.Headers.Add("Authorization", authHeader);
        request.Headers.Add("x-xbl-contract-version", "3");

        var response = await _httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();
        
        var json = await response.Content.ReadAsStringAsync();
        var profileResponse = JsonSerializer.Deserialize<XboxProfile>(json);
        
        var gamertag = profileResponse?.ProfileUsers?.FirstOrDefault()?.Settings?
            .FirstOrDefault(s => s.Id == "Gamertag")?.Value?.ToString();

        return new UserInfo { Gamertag = gamertag ?? "Unknown" };
    }

    // Response classes for Microsoft and Xbox Live APIs
    private class MicrosoftTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = string.Empty;

        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; } = string.Empty;

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }
    }

    private class XboxLiveTokenResponse
    {
        [JsonPropertyName("Token")]
        public string Token { get; set; } = string.Empty;
    }

    private class XstsTokenResponseRaw
    {
        [JsonPropertyName("Token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("DisplayClaims")]
        public DisplayClaims DisplayClaims { get; set; } = new();
    }

    private class DisplayClaims
    {
        [JsonPropertyName("xui")]
        public List<XuiClaim> Xui { get; set; } = new();
    }

    private class XuiClaim
    {
        [JsonPropertyName("uhs")]
        public string Uhs { get; set; } = string.Empty;
    }

    private class XstsTokenResponse
    {
        public string Token { get; init; } = string.Empty;
        public string UserHash { get; init; } = string.Empty;
    }

    private class UserInfo
    {
        public string Gamertag { get; init; } = string.Empty;
    }
}