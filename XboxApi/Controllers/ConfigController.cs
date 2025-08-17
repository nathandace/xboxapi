using Microsoft.AspNetCore.Mvc;
using XboxApi.Models;
using XboxApi.Services;

namespace XboxApi.Controllers;

[ApiController]
[Route("api/config")]
public class ConfigController : ControllerBase
{
    private readonly IConfigService _configService;
    private readonly ILogger<ConfigController> _logger;

    /// <summary>
    /// Initializes a new instance of the ConfigController class
    /// </summary>
    /// <param name="configService">The configuration service</param>
    /// <param name="logger">The logger instance</param>
    public ConfigController(IConfigService configService, ILogger<ConfigController> logger)
    {
        _configService = configService;
        _logger = logger;
    }

    /// <summary>
    /// Get current configuration
    /// </summary>
    /// <returns>Current app configuration</returns>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<AppConfig>>> GetConfig()
    {
        try
        {
            var config = await _configService.GetConfigAsync();
            return Ok(new ApiResponse<AppConfig>
            {
                Success = true,
                Data = config
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get config");
            return StatusCode(500, new ApiResponse<AppConfig>
            {
                Success = false,
                Error = "Failed to get configuration"
            });
        }
    }

    /// <summary>
    /// Update configuration
    /// </summary>
    /// <param name="request">Configuration update request</param>
    /// <returns>Updated configuration</returns>
    [HttpPut]
    public async Task<ActionResult<ApiResponse<AppConfig>>> UpdateConfig([FromBody] ConfigUpdateRequest request)
    {
        try
        {
            await _configService.UpdateConfigAsync(request);
            var updatedConfig = await _configService.GetConfigAsync();
            
            return Ok(new ApiResponse<AppConfig>
            {
                Success = true,
                Data = updatedConfig
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update config");
            return StatusCode(500, new ApiResponse<AppConfig>
            {
                Success = false,
                Error = "Failed to update configuration"
            });
        }
    }
}