using XboxApi.Models;

namespace XboxApi.Services;

/// <summary>
/// Interface for application configuration services
/// </summary>
public interface IConfigService
{
    /// <summary>
    /// Gets the current application configuration
    /// </summary>
    /// <returns>The current AppConfig instance</returns>
    Task<AppConfig> GetConfigAsync();
    
    /// <summary>
    /// Updates the application configuration with new settings
    /// </summary>
    /// <param name="request">Configuration update request containing new settings</param>
    Task UpdateConfigAsync(ConfigUpdateRequest request);
    
    /// <summary>
    /// Retrieves cover art URL for a game using the Giant Bomb API
    /// </summary>
    /// <param name="gameName">Name of the game to search for</param>
    /// <returns>Cover art URL if found, null otherwise</returns>
    Task<string?> GetGameCoverArtAsync(string gameName);
}