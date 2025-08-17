using XboxApi.Models;

namespace XboxApi.Services;

/// <summary>
/// Interface for Xbox Live API services
/// </summary>
public interface IXboxApiService
{
    /// <summary>
    /// Retrieves Xbox profile information for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox profile data including gamertag, gamerscore, etc.</returns>
    Task<XboxProfile> GetProfileAsync(string username);
    
    /// <summary>
    /// Retrieves Xbox presence information for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox presence data including online status and current activity</returns>
    Task<XboxPresence> GetPresenceAsync(string username);
    
    /// <summary>
    /// Retrieves Xbox friends list for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox friends list data</returns>
    Task<XboxFriends> GetFriendsAsync(string username);
    
    /// <summary>
    /// Retrieves recent games and gaming history for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox games data including recent titles and achievements</returns>
    Task<XboxGames> GetGamesAsync(string username);
    
    /// <summary>
    /// Retrieves comprehensive status information for a user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Combined user status including profile, presence, and games</returns>
    Task<UserStatusResponse> GetUserStatusAsync(string username);
    
    /// <summary>
    /// Retrieves combined Xbox status for all authenticated users
    /// </summary>
    /// <returns>Combined status showing active games and players</returns>
    Task<XboxStatusResponse> GetCombinedStatusAsync();
    
    /// <summary>
    /// Retrieves all players currently playing a specific game
    /// </summary>
    /// <param name="gameId">The Xbox game ID to search for</param>
    /// <returns>List of users currently playing the specified game</returns>
    Task<List<UserInGame>> GetPlayersInGameAsync(string gameId);
}