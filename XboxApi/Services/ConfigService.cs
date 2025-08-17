using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using XboxApi.Models;

namespace XboxApi.Services;

public class ConfigService : IConfigService
{
    private readonly string _configFilePath;
    private readonly HttpClient _httpClient;
    private readonly ILogger<ConfigService> _logger;
    private readonly ConcurrentDictionary<string, string?> _coverArtCache = new();
    private AppConfig _config = new();

    /// <summary>
    /// Initializes a new instance of the ConfigService class
    /// </summary>
    /// <param name="httpClient">HTTP client for making API requests</param>
    /// <param name="logger">Logger instance</param>
    public ConfigService(HttpClient httpClient, ILogger<ConfigService> logger)
    {
        _configFilePath = Path.Combine(Directory.GetCurrentDirectory(), "config.json");
        _httpClient = httpClient;
        _logger = logger;
        
        // Load config on startup
        LoadConfigAsync().GetAwaiter().GetResult();
    }

    /// <summary>
    /// Gets the current application configuration
    /// </summary>
    /// <returns>The current AppConfig instance</returns>
    public Task<AppConfig> GetConfigAsync()
    {
        return Task.FromResult(_config);
    }

    /// <summary>
    /// Updates the application configuration with new settings
    /// </summary>
    /// <param name="request">Configuration update request containing new settings</param>
    public async Task UpdateConfigAsync(ConfigUpdateRequest request)
    {
        _config.GiantBombApiKey = request.GiantBombApiKey?.Trim();
        
        // Clear cache when API key changes
        _coverArtCache.Clear();
        
        await SaveConfigAsync();
        
        _logger.LogInformation("Updated Giant Bomb API key, cover art {Status}", _config.EnableCoverArt ? "enabled" : "disabled");
    }

    /// <summary>
    /// Retrieves cover art URL for a game using the Giant Bomb API
    /// </summary>
    /// <param name="gameName">Name of the game to search for</param>
    /// <returns>Cover art URL if found, null otherwise</returns>
    public async Task<string?> GetGameCoverArtAsync(string gameName)
    {
        if (!_config.EnableCoverArt)
            return null;

        var cleanedName = CleanGameName(gameName);
        
        if (_coverArtCache.TryGetValue(cleanedName, out var cachedUrl))
            return cachedUrl;

        try
        {
            var response = await _httpClient.GetAsync($"https://www.giantbomb.com/api/search/?api_key={_config.GiantBombApiKey}&format=json&query={Uri.EscapeDataString(cleanedName)}&resources=game&limit=1");
            
            if (!response.IsSuccessStatusCode)
            {
                _coverArtCache[cleanedName] = null;
                return null;
            }

            var json = await response.Content.ReadAsStringAsync();
            var searchResult = JsonSerializer.Deserialize<GiantBombSearchResponse>(json, new JsonSerializerOptions 
            { 
                PropertyNameCaseInsensitive = true 
            });

            var coverUrl = searchResult?.Results?.FirstOrDefault()?.Image?.OriginalUrl;
            _coverArtCache[cleanedName] = coverUrl;
            
            if (!string.IsNullOrEmpty(coverUrl))
            {
                _logger.LogDebug("Found cover art for {GameName}: {CoverUrl}", gameName, coverUrl);
            }
            else
            {
                _logger.LogDebug("No cover art found for {GameName}", gameName);
            }
            
            return coverUrl;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get cover art for game: {GameName}", gameName);
            _coverArtCache[cleanedName] = null;
            return null;
        }
    }

    /// <summary>
    /// Loads configuration from the config file
    /// </summary>
    private async Task LoadConfigAsync()
    {
        try
        {
            if (File.Exists(_configFilePath))
            {
                var json = await File.ReadAllTextAsync(_configFilePath);
                var config = JsonSerializer.Deserialize<AppConfig>(json, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
                
                if (config != null)
                {
                    _config = config;
                    _logger.LogInformation("Loaded config, cover art {Status}", _config.EnableCoverArt ? "enabled" : "disabled");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load config");
        }
    }

    /// <summary>
    /// Saves the current configuration to the config file
    /// </summary>
    private async Task SaveConfigAsync()
    {
        try
        {
            var json = JsonSerializer.Serialize(_config, new JsonSerializerOptions 
            { 
                WriteIndented = true 
            });
            await File.WriteAllTextAsync(_configFilePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save config");
        }
    }

    /// <summary>
    /// Cleans a game name by removing trademark symbols and extra whitespace
    /// </summary>
    /// <param name="gameName">The game name to clean</param>
    /// <returns>Cleaned game name</returns>
    private static string CleanGameName(string gameName)
    {
        return gameName
            .Replace("™", "")
            .Replace("®", "")
            .Replace("©", "")
            .Trim();
    }

}