using Microsoft.AspNetCore.Mvc;
using XboxApi.Models;
using XboxApi.Services;

namespace XboxApi.Controllers;

[ApiController]
[Route("auth")]
public class AuthController : ControllerBase
{
    private readonly IXboxAuthService _authService;
    private readonly ILogger<AuthController> _logger;

    /// <summary>
    /// Initializes a new instance of the AuthController class
    /// </summary>
    /// <param name="authService">The Xbox authentication service</param>
    /// <param name="logger">The logger instance</param>
    public AuthController(IXboxAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    /// <summary>
    /// Get authentication URL for a user
    /// </summary>
    /// <param name="username">The username to authenticate</param>
    /// <returns>Authentication URL</returns>
    [HttpGet("url")]
    public async Task<ActionResult<ApiResponse<string>>> GetAuthUrl([FromQuery] string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ApiResponse<string>
            {
                Success = false,
                Error = "Username is required"
            });
        }

        try
        {
            var authUrl = await _authService.GetAuthorizationUrlAsync(username);
            
            return Ok(new ApiResponse<string>
            {
                Success = true,
                Data = authUrl
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate auth URL for user {Username}", username);
            return StatusCode(500, new ApiResponse<string>
            {
                Success = false,
                Error = "Failed to generate authentication URL"
            });
        }
    }

    /// <summary>
    /// Exchange authorization code for tokens
    /// </summary>
    /// <param name="code">Authorization code from Microsoft</param>
    /// <param name="state">State parameter for security</param>
    /// <returns>Success confirmation</returns>
    [HttpPost("callback")]
    public async Task<ActionResult<ApiResponse<object>>> AuthCallback([FromQuery] string code, [FromQuery] string state)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
        {
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = "Code and state parameters are required"
            });
        }

        try
        {
            var tokens = await _authService.ExchangeCodeForTokensAsync(code, state);
            
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Data = new 
                { 
                    Message = "Authentication successful",
                    tokens.Username,
                    tokens.Gamertag
                }
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("Invalid state or code provided: {Message}", ex.Message);
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to exchange code for tokens");
            return StatusCode(500, new ApiResponse<object>
            {
                Success = false,
                Error = "Authentication failed"
            });
        }
    }

    /// <summary>
    /// Check authentication status for a user
    /// </summary>
    /// <param name="username">The username to check</param>
    /// <returns>Authentication status</returns>
    [HttpGet("status")]
    public async Task<ActionResult<ApiResponse<object>>> GetAuthStatus([FromQuery] string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = "Username is required"
            });
        }

        try
        {
            var tokens = await _authService.GetTokensAsync(username);
            
            if (tokens == null)
            {
                return Ok(new ApiResponse<object>
                {
                    Success = true,
                    Data = new { Authenticated = false, Message = "No tokens found for user" }
                });
            }

            return Ok(new ApiResponse<object>
            {
                Success = true,
                Data = new
                {
                    Authenticated = !tokens.IsExpired,
                    tokens.Username,
                    tokens.Gamertag,
                    TokenExpiry = DateTimeOffset.FromUnixTimeMilliseconds(tokens.ExpiresAt),
                    tokens.IsExpired,
                    tokens.IsExpiringSoon
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get auth status for user {Username}", username);
            return StatusCode(500, new ApiResponse<object>
            {
                Success = false,
                Error = "Failed to get authentication status"
            });
        }
    }

    /// <summary>
    /// Refresh tokens for a user
    /// </summary>
    /// <param name="username">The username to refresh tokens for</param>
    /// <returns>Success confirmation</returns>
    [HttpPost("refresh")]
    public async Task<ActionResult<ApiResponse<object>>> RefreshTokens([FromQuery] string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest(new ApiResponse<object>
            {
                Success = false,
                Error = "Username is required"
            });
        }

        try
        {
            var tokens = await _authService.RefreshTokensAsync(username);
            
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Data = new
                {
                    Message = "Tokens refreshed successfully",
                    tokens.Username,
                    tokens.Gamertag,
                    TokenExpiry = DateTimeOffset.FromUnixTimeMilliseconds(tokens.ExpiresAt)
                }
            });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new ApiResponse<object>
            {
                Success = false,
                Error = ex.Message
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh tokens for user {Username}", username);
            return StatusCode(500, new ApiResponse<object>
            {
                Success = false,
                Error = "Failed to refresh tokens"
            });
        }
    }
}