using Microsoft.AspNetCore.Mvc;
using XboxApi.Models;
using XboxApi.Services;

namespace XboxApi.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly IXboxAuthService _authService;
    private readonly ILogger<UsersController> _logger;

    /// <summary>
    /// Initializes a new instance of the UsersController class
    /// </summary>
    /// <param name="authService">The Xbox authentication service</param>
    /// <param name="logger">The logger instance</param>
    public UsersController(IXboxAuthService authService, ILogger<UsersController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    /// <summary>
    /// Get all authenticated users with their status
    /// </summary>
    /// <returns>List of authenticated users with token status</returns>
    [HttpGet]
    public async Task<ActionResult<List<AuthenticatedUser>>> GetUsers()
    {
        try
        {
            var usernames = await _authService.GetAuthenticatedUsersAsync();
            var users = new List<AuthenticatedUser>();

            foreach (var username in usernames)
            {
                try
                {
                    var tokens = await _authService.GetTokensAsync(username);
                    var gamertag = await _authService.GetStoredGamertagAsync(username) ?? username;

                    if (tokens != null)
                    {
                        var tokenAge = (int)TimeSpan.FromMilliseconds(
                            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - tokens.Timestamp
                        ).TotalDays;

                        users.Add(new AuthenticatedUser
                        {
                            Username = username,
                            Gamertag = gamertag,
                            Status = tokens.IsExpired ? "expired" : "authenticated",
                            TokenExpiry = DateTimeOffset.FromUnixTimeMilliseconds(tokens.ExpiresAt).DateTime,
                            TokenAge = tokenAge,
                            EstimatedRefreshDaysLeft = Math.Max(0, 90 - tokenAge),
                            AuthTimestamp = DateTimeOffset.FromUnixTimeMilliseconds(tokens.Timestamp).DateTime
                        });
                    }
                    else
                    {
                        users.Add(new AuthenticatedUser
                        {
                            Username = username,
                            Gamertag = gamertag,
                            Status = "error",
                            TokenAge = 0,
                            EstimatedRefreshDaysLeft = 0
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to get user info for {Username}", username);
                    users.Add(new AuthenticatedUser
                    {
                        Username = username,
                        Gamertag = username,
                        Status = "error",
                        TokenAge = 0,
                        EstimatedRefreshDaysLeft = 0
                    });
                }
            }

            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get users");
            return StatusCode(500, new { Error = "Failed to get users" });
        }
    }

    /// <summary>
    /// Remove a user's authentication
    /// </summary>
    /// <param name="username">The username to remove</param>
    /// <returns>Success status and message</returns>
    [HttpDelete("{username}")]
    public async Task<ActionResult<object>> RemoveUser(string username)
    {
        try
        {
            var removed = await _authService.RemoveUserAsync(username);
            
            if (removed)
            {
                return Ok(new 
                { 
                    Success = true, 
                    Message = $"User {username} removed successfully" 
                });
            }

            return NotFound(new 
            { 
                Success = false, 
                Error = "User not found" 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove user {Username}", username);
            return StatusCode(500, new { Error = "Failed to remove user" });
        }
    }
}