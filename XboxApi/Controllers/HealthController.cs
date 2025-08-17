using Microsoft.AspNetCore.Mvc;
using XboxApi.Services;

namespace XboxApi.Controllers;

[ApiController]
public class HealthController : ControllerBase
{
    private readonly IXboxAuthService _authService;
    private readonly ILogger<HealthController> _logger;

    /// <summary>
    /// Initializes a new instance of the HealthController class
    /// </summary>
    /// <param name="authService">The Xbox authentication service</param>
    /// <param name="logger">The logger instance</param>
    public HealthController(
        IXboxAuthService authService, 
        ILogger<HealthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    /// <summary>
    /// Health check endpoint
    /// </summary>
    /// <returns>API health status and basic statistics</returns>
    [HttpGet("health")]
    public async Task<ActionResult<object>> GetHealth()
    {
        try
        {
            var authenticatedUsers = await _authService.GetAuthenticatedUsersAsync();
            var stats = _authService.GetAuthStats();

            return Ok(new
            {
                Success = true,
                Message = "Xbox Authentication API is running",
                Ready = true,
                ClientId = "000000004C12AE6F",
                AuthenticatedUsers = authenticatedUsers,
                Stats = new
                {
                    TotalUsers = stats.totalUsers,
                    ValidTokens = stats.validTokens,
                    ExpiredTokens = stats.expiredTokens
                },
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Health check failed");
            return StatusCode(500, new
            {
                Success = false,
                Message = "Health check failed",
                Ready = false,
                Error = ex.Message,
                Timestamp = DateTime.UtcNow
            });
        }
    }

}