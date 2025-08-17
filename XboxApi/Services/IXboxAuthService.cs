using XboxApi.Models;

namespace XboxApi.Services;

/// <summary>
/// Interface for Xbox authentication services
/// </summary>
public interface IXboxAuthService
{
    /// <summary>
    /// Generates an authorization URL for Xbox Live authentication
    /// </summary>
    /// <param name="username">The username to authenticate</param>
    /// <returns>Authorization URL for Microsoft OAuth</returns>
    Task<string> GetAuthorizationUrlAsync(string username);
    
    /// <summary>
    /// Exchanges an authorization code for Xbox Live tokens
    /// </summary>
    /// <param name="code">Authorization code from Microsoft OAuth</param>
    /// <param name="state">State parameter for security validation</param>
    /// <returns>Xbox token data including access and refresh tokens</returns>
    Task<XboxTokenData> ExchangeCodeForTokensAsync(string code, string state);
    
    /// <summary>
    /// Refreshes expired Xbox Live tokens for a user
    /// </summary>
    /// <param name="username">The username to refresh tokens for</param>
    /// <returns>Refreshed Xbox token data</returns>
    Task<XboxTokenData> RefreshTokensAsync(string username);
    
    /// <summary>
    /// Retrieves stored tokens for a user
    /// </summary>
    /// <param name="username">The username to get tokens for</param>
    /// <returns>Xbox token data if found, null otherwise</returns>
    Task<XboxTokenData?> GetTokensAsync(string username);
    
    /// <summary>
    /// Removes a user's authentication tokens
    /// </summary>
    /// <param name="username">The username to remove</param>
    /// <returns>True if user was removed, false if not found</returns>
    Task<bool> RemoveUserAsync(string username);
    
    /// <summary>
    /// Gets a list of all authenticated usernames
    /// </summary>
    /// <returns>List of authenticated usernames</returns>
    Task<List<string>> GetAuthenticatedUsersAsync();
    
    /// <summary>
    /// Retrieves the stored gamertag for a user
    /// </summary>
    /// <param name="username">The username to get gamertag for</param>
    /// <returns>Gamertag if found, null otherwise</returns>
    Task<string?> GetStoredGamertagAsync(string username);
    
    /// <summary>
    /// Loads authentication tokens from persistent storage
    /// </summary>
    Task LoadTokensAsync();
    
    /// <summary>
    /// Saves authentication tokens to persistent storage
    /// </summary>
    Task SaveTokensAsync();
    
    /// <summary>
    /// Gets authentication statistics for all users
    /// </summary>
    /// <returns>Tuple containing total users, expired tokens, and valid tokens counts</returns>
    (int totalUsers, int expiredTokens, int validTokens) GetAuthStats();
}