using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using XboxApi.Models;

namespace XboxApi.Services;

public class XboxApiService : IXboxApiService
{
    private readonly HttpClient _httpClient;
    private readonly IXboxAuthService _authService;
    private readonly IConfigService _configService;
    private readonly IMemoryCache _cache;
    private readonly ILogger<XboxApiService> _logger;
    private const int CacheExpirationSeconds = 30;

    /// <summary>
    /// Initializes a new instance of the XboxApiService class
    /// </summary>
    /// <param name="httpClient">HTTP client for making API requests</param>
    /// <param name="authService">Xbox authentication service</param>
    /// <param name="configService">Configuration service</param>
    /// <param name="cache">Memory cache for response caching</param>
    /// <param name="logger">Logger instance</param>
    public XboxApiService(
        HttpClient httpClient, 
        IXboxAuthService authService, 
        IConfigService configService,
        IMemoryCache cache,
        ILogger<XboxApiService> logger)
    {
        _httpClient = httpClient;
        _authService = authService;
        _configService = configService;
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Retrieves Xbox profile information for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox profile data including gamertag, gamerscore, etc.</returns>
    public async Task<XboxProfile> GetProfileAsync(string username)
    {
        return await MakeAuthenticatedApiCallAsync<XboxProfile>(
            username,
            async (authHeader) =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get,
                    "https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,Gamerscore,AccountTier,TenureLevel,XboxOneRep,PreferredColor,RealName,Bio,Location,ModernGamertag,ModernGamertagSuffix,UniqueModernGamertag");
                
                request.Headers.Add("Authorization", authHeader);
                request.Headers.Add("x-xbl-contract-version", "3");
                request.Headers.Add("Accept", "application/json");

                return await _httpClient.SendAsync(request);
            });
    }

    /// <summary>
    /// Retrieves Xbox presence information for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox presence data including online status and current activity</returns>
    public async Task<XboxPresence> GetPresenceAsync(string username)
    {
        return await MakeAuthenticatedApiCallAsync<XboxPresence>(
            username,
            async (authHeader) =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get,
                    "https://userpresence.xboxlive.com/users/me?level=all");
                
                request.Headers.Add("Authorization", authHeader);
                request.Headers.Add("x-xbl-contract-version", "3");
                request.Headers.Add("Accept", "application/json");

                return await _httpClient.SendAsync(request);
            });
    }

    /// <summary>
    /// Retrieves Xbox friends list for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox friends list data</returns>
    public async Task<XboxFriends> GetFriendsAsync(string username)
    {
        return await MakeAuthenticatedApiCallAsync<XboxFriends>(
            username,
            async (authHeader) =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get,
                    "https://social.xboxlive.com/users/me/people");
                
                request.Headers.Add("Authorization", authHeader);
                request.Headers.Add("x-xbl-contract-version", "5");
                request.Headers.Add("Accept", "application/json");

                return await _httpClient.SendAsync(request);
            });
    }

    /// <summary>
    /// Retrieves recent games and gaming history for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox games data including recent titles and achievements</returns>
    public async Task<XboxGames> GetGamesAsync(string username)
    {
        return await MakeAuthenticatedApiCallAsync<XboxGames>(
            username,
            async (authHeader) =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get,
                    "https://titlehub.xboxlive.com/users/me/titles/titlehistory/decoration/detail");
                
                request.Headers.Add("Authorization", authHeader);
                request.Headers.Add("x-xbl-contract-version", "2");
                request.Headers.Add("Accept", "application/json");

                return await _httpClient.SendAsync(request);
            });
    }

    /// <summary>
    /// Retrieves comprehensive status information for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Combined user status including profile, presence, and games</returns>
    public async Task<UserStatusResponse> GetUserStatusAsync(string username)
    {
        var response = new UserStatusResponse
        {
            Username = username,
            Timestamp = DateTime.UtcNow
        };

        // Use Task.WhenAll for parallel execution but handle errors individually
        var tasks = new[]
        {
            ExecuteSafelyAsync(() => GetProfileAsync(username)),
            ExecuteSafelyAsync(() => GetPresenceAsync(username)),
            ExecuteSafelyAsync(() => GetGamesAsync(username))
        };

        var results = await Task.WhenAll(tasks);

        // Process results
        if (results[0].IsSuccess)
            response.Profile = results[0].Result as XboxProfile;
        else
            response.ProfileError = results[0].Error;

        if (results[1].IsSuccess)
            response.Presence = results[1].Result as XboxPresence;
        else
            response.PresenceError = results[1].Error;

        if (results[2].IsSuccess)
            response.RecentGames = results[2].Result as XboxGames;
        else
            response.GamesError = results[2].Error;

        return response;
    }

    /// <summary>
    /// Retrieves combined Xbox status for all authenticated users
    /// </summary>
    /// <returns>Combined status showing active games and players</returns>
    public async Task<XboxStatusResponse> GetCombinedStatusAsync()
    {
        // Check cache first
        const string cacheKey = "xbox_combined_status";
        if (_cache.TryGetValue(cacheKey, out XboxStatusResponse? cachedResponse))
        {
            return cachedResponse!;
        }

        var users = await _authService.GetAuthenticatedUsersAsync();
        if (!users.Any())
        {
            var emptyResponse = new XboxStatusResponse();
            _cache.Set(cacheKey, emptyResponse, TimeSpan.FromSeconds(CacheExpirationSeconds));
            return emptyResponse;
        }

        var userPresenceTasks = users.Select(async username =>
        {
            try
            {
                var gamertag = await _authService.GetStoredGamertagAsync(username) ?? username;
                var presence = await GetPresenceAsync(username);

                return FindActiveGame(username, gamertag, presence);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get presence for user {Username}", username);
                return null;
            }
        });

        var userResults = await Task.WhenAll(userPresenceTasks);
        var activeUsers = userResults.Where(u => u != null).ToList();

        var response = new XboxStatusResponse();
        
        if (activeUsers.Any())
        {
            var firstUser = activeUsers.First()!;
            response.ActiveGame = new ActiveGame
            {
                Id = firstUser.GameId,
                Name = firstUser.GameName,
                DeviceType = firstUser.DeviceType,
                RichPresence = firstUser.RichPresence
            };

            response.Users = activeUsers.Select(u => new UserInGame
            {
                Username = u!.Username,
                Gamertag = u.Gamertag
            }).ToList();

            // Get cover art if enabled
            try
            {
                var coverArtUrl = await _configService.GetGameCoverArtAsync(response.ActiveGame.Name);
                if (!string.IsNullOrEmpty(coverArtUrl))
                {
                    response.ActiveGame.CoverArtUrl = coverArtUrl;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get cover art for game: {GameName}", response.ActiveGame.Name);
            }
        }

        _cache.Set(cacheKey, response, TimeSpan.FromSeconds(CacheExpirationSeconds));
        return response;
    }

    /// <summary>
    /// Retrieves all players currently playing a specific game
    /// </summary>
    /// <param name="gameId">The Xbox game ID to search for</param>
    /// <returns>List of users currently playing the specified game</returns>
    public async Task<List<UserInGame>> GetPlayersInGameAsync(string gameId)
    {
        var users = await _authService.GetAuthenticatedUsersAsync();
        var tasks = users.Select(async username =>
        {
            try
            {
                var gamertag = await _authService.GetStoredGamertagAsync(username) ?? username;
                var presence = await GetPresenceAsync(username);

                var activeGame = FindActiveGame(username, gamertag, presence);
                return activeGame?.GameId == gameId ? new UserInGame
                {
                    Username = username,
                    Gamertag = gamertag
                } : null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to check game presence for user {Username}", username);
                return null;
            }
        });

        var results = await Task.WhenAll(tasks);
        return results.Where(r => r != null).ToList()!;
    }

    /// <summary>
    /// Makes an authenticated API call to Xbox Live services
    /// </summary>
    /// <typeparam name="T">The expected response type</typeparam>
    /// <param name="username">The authenticated username</param>
    /// <param name="apiCall">Function that makes the API call with authentication header</param>
    /// <returns>Deserialized response of type T</returns>
    private async Task<T> MakeAuthenticatedApiCallAsync<T>(
        string username, 
        Func<string, Task<HttpResponseMessage>> apiCall)
    {
        var tokens = await _authService.GetTokensAsync(username);
        if (tokens == null)
        {
            throw new UnauthorizedAccessException($"No tokens found for user: {username}");
        }

        // Check if token needs refresh
        if (tokens.IsExpiringSoon)
        {
            tokens = await _authService.RefreshTokensAsync(username);
        }

        var response = await apiCall(tokens.AuthorizationHeader);
        
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            _logger.LogWarning("Received 401 for {Username}, attempting token refresh", username);
            tokens = await _authService.RefreshTokensAsync(username);
            response = await apiCall(tokens.AuthorizationHeader);
        }

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        
        return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? throw new InvalidOperationException($"Failed to deserialize response of type {typeof(T).Name}");
    }

    /// <summary>
    /// Executes an operation safely, catching and logging any exceptions
    /// </summary>
    /// <typeparam name="T">The expected result type</typeparam>
    /// <param name="operation">The operation to execute</param>
    /// <returns>Safe result containing either the result or error information</returns>
    private async Task<SafeResult> ExecuteSafelyAsync<T>(Func<Task<T>> operation)
    {
        try
        {
            var result = await operation();
            return new SafeResult { IsSuccess = true, Result = result };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Operation failed safely");
            return new SafeResult { IsSuccess = false, Error = ex.Message };
        }
    }

    /// <summary>
    /// Finds the currently active game from a user's Xbox presence data
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <param name="gamertag">The user's gamertag</param>
    /// <param name="presence">Xbox presence data</param>
    /// <returns>Active game information if found, null otherwise</returns>
    private ActiveGameInfo? FindActiveGame(string username, string gamertag, XboxPresence presence)
    {
        var xboxDeviceTypes = new[] { "Scarlett", "XboxOne", "XboxSeriesX", "Xbox360", "XboxSeriesS" };
        
        foreach (var device in presence.Devices)
        {
            if (!xboxDeviceTypes.Contains(device.Type)) continue;

            foreach (var title in device.Titles)
            {
                if (title.Placement == "Full" && title.State == "Active" && title.Name != "Home")
                {
                    return new ActiveGameInfo
                    {
                        Username = username,
                        Gamertag = gamertag,
                        GameId = title.Id,
                        GameName = title.Name,
                        DeviceType = device.Type,
                        RichPresence = title.Activity?.RichPresence
                    };
                }
            }
        }

        return null;
    }

    private class SafeResult
    {
        public bool IsSuccess { get; init; }
        public object? Result { get; init; }
        public string? Error { get; init; }
    }

    private class ActiveGameInfo
    {
        public string Username { get; init; } = string.Empty;
        public string Gamertag { get; init; } = string.Empty;
        public string GameId { get; init; } = string.Empty;
        public string GameName { get; init; } = string.Empty;
        public string? DeviceType { get; init; }
        public string? RichPresence { get; init; }
    }
}