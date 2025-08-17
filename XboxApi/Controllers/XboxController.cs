using Microsoft.AspNetCore.Mvc;
using XboxApi.Models;
using XboxApi.Services;

namespace XboxApi.Controllers;

[ApiController]
[Route("xbox")]
public class XboxController : ControllerBase
{
    private readonly IXboxApiService _xboxApiService;
    private readonly IXboxAuthService _authService;
    private readonly ILogger<XboxController> _logger;

    /// <summary>
    /// Initializes a new instance of the XboxController class
    /// </summary>
    /// <param name="xboxApiService">The Xbox API service</param>
    /// <param name="authService">The Xbox authentication service</param>
    /// <param name="logger">The logger instance</param>
    public XboxController(
        IXboxApiService xboxApiService, 
        IXboxAuthService authService,
        ILogger<XboxController> logger)
    {
        _xboxApiService = xboxApiService;
        _authService = authService;
        _logger = logger;
    }

    /// <summary>
    /// Get Xbox profile for a specific user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox profile data including gamertag, gamerscore, etc.</returns>
    [HttpGet("profile/{username}")]
    public async Task<ActionResult<ApiResponse<XboxProfile>>> GetProfile(string username)
    {
        try
        {
            var profile = await _xboxApiService.GetProfileAsync(username);
            return Ok(new ApiResponse<XboxProfile>
            {
                Success = true,
                Data = profile
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new ApiResponse<XboxProfile>
            {
                Success = false,
                Error = ex.Message,
                Action = "Please authenticate or refresh tokens"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Xbox profile for user {Username}", username);
            return StatusCode(500, new ApiResponse<XboxProfile>
            {
                Success = false,
                Error = "Failed to get Xbox profile"
            });
        }
    }

    /// <summary>
    /// Get Xbox presence for a specific user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox presence data including online status and activity</returns>
    [HttpGet("presence/{username}")]
    public async Task<ActionResult<ApiResponse<XboxPresence>>> GetPresence(string username)
    {
        try
        {
            var presence = await _xboxApiService.GetPresenceAsync(username);
            return Ok(new ApiResponse<XboxPresence>
            {
                Success = true,
                Data = presence
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new ApiResponse<XboxPresence>
            {
                Success = false,
                Error = ex.Message,
                Action = "Please authenticate or refresh tokens"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Xbox presence for user {Username}", username);
            return StatusCode(500, new ApiResponse<XboxPresence>
            {
                Success = false,
                Error = "Failed to get Xbox presence"
            });
        }
    }

    /// <summary>
    /// Get Xbox friends list for a specific user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Xbox friends list data</returns>
    [HttpGet("friends/{username}")]
    public async Task<ActionResult<ApiResponse<XboxFriends>>> GetFriends(string username)
    {
        try
        {
            var friends = await _xboxApiService.GetFriendsAsync(username);
            return Ok(new ApiResponse<XboxFriends>
            {
                Success = true,
                Data = friends
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new ApiResponse<XboxFriends>
            {
                Success = false,
                Error = ex.Message,
                Action = "Please authenticate or refresh tokens"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Xbox friends for user {Username}", username);
            return StatusCode(500, new ApiResponse<XboxFriends>
            {
                Success = false,
                Error = "Failed to get Xbox friends"
            });
        }
    }

    /// <summary>
    /// Get recent games for a specific user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Recent games and gaming history</returns>
    [HttpGet("games/{username}")]
    public async Task<ActionResult<ApiResponse<XboxGames>>> GetGames(string username)
    {
        try
        {
            var games = await _xboxApiService.GetGamesAsync(username);
            return Ok(new ApiResponse<XboxGames>
            {
                Success = true,
                Data = games
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new ApiResponse<XboxGames>
            {
                Success = false,
                Error = ex.Message,
                Action = "Please authenticate or refresh tokens"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Xbox games for user {Username}", username);
            return StatusCode(500, new ApiResponse<XboxGames>
            {
                Success = false,
                Error = "Failed to get Xbox games"
            });
        }
    }

    /// <summary>
    /// Get comprehensive Xbox status for a specific user
    /// </summary>
    /// <param name="username">The authenticated username</param>
    /// <returns>Combined profile, presence, and games data</returns>
    [HttpGet("status/{username}")]
    public async Task<ActionResult<UserStatusResponse>> GetUserStatus(string username)
    {
        try
        {
            var status = await _xboxApiService.GetUserStatusAsync(username);
            return Ok(status);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message,
                Action = "Please authenticate or refresh tokens"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get Xbox status for user {Username}", username);
            return StatusCode(500, new ApiResponse<object>
            {
                Success = false,
                Error = "Failed to get Xbox status"
            });
        }
    }

    /// <summary>
    /// Primary Multi-Profile Xbox Status Endpoint (for Home Assistant)
    /// This is the main endpoint for Home Assistant integration
    /// </summary>
    /// <returns>Active game and users currently playing</returns>
    [HttpGet("status")]
    public async Task<ActionResult<XboxStatusResponse>> GetCombinedStatus()
    {
        try
        {
            var status = await _xboxApiService.GetCombinedStatusAsync();
            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get combined Xbox status");
            
            // Return error but with empty data structure for compatibility
            return StatusCode(500, new XboxStatusResponse
            {
                Success = false,
                ActiveGame = null,
                Users = new List<UserInGame>()
            });
        }
    }

    /// <summary>
    /// Get Xbox status for all authenticated users
    /// </summary>
    /// <returns>Status data for all authenticated users</returns>
    [HttpGet("status-all")]
    public async Task<ActionResult<object>> GetAllUsersStatus()
    {
        try
        {
            var users = await _authService.GetAuthenticatedUsersAsync();
            
            if (!users.Any())
            {
                return Ok(new
                {
                    Success = true,
                    Message = "No authenticated users",
                    Users = new List<object>()
                });
            }

            var userStatusTasks = users.Select<string, Task<object>>(async username =>
            {
                try
                {
                    var gamertag = await _authService.GetStoredGamertagAsync(username) ?? username;
                    var profile = await _xboxApiService.GetProfileAsync(username);
                    var presence = await _xboxApiService.GetPresenceAsync(username);

                    return new
                    {
                        Username = username,
                        Gamertag = gamertag,
                        Authenticated = true,
                        Profile = profile,
                        Presence = presence
                    };
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to get status for user {Username}", username);
                    return new
                    {
                        Username = username,
                        Gamertag = username,
                        Authenticated = false,
                        Profile = (object?)null,
                        Presence = (object?)null,
                        Error = ex.Message
                    };
                }
            });

            var results = await Task.WhenAll(userStatusTasks);

            return Ok(new
            {
                Success = true,
                Timestamp = DateTime.UtcNow,
                TotalUsers = users.Count,
                Users = results
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get all users status");
            return StatusCode(500, new
            {
                Success = false,
                Error = "Failed to get all users status"
            });
        }
    }

    /// <summary>
    /// Get all players currently playing a specific game
    /// </summary>
    /// <param name="gameId">The Xbox game ID</param>
    /// <returns>List of players currently playing the specified game</returns>
    [HttpGet("game/{gameId}/players")]
    public async Task<ActionResult<object>> GetPlayersInGame(string gameId)
    {
        try
        {
            var players = await _xboxApiService.GetPlayersInGameAsync(gameId);
            
            return Ok(new
            {
                Success = true,
                GameId = gameId,
                PlayerCount = players.Count,
                Players = players,
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get players for game {GameId}", gameId);
            return StatusCode(500, new
            {
                Success = false,
                Error = "Failed to get players in game"
            });
        }
    }
}