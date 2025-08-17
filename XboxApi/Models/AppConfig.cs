namespace XboxApi.Models;

public class AppConfig
{
    public string? GiantBombApiKey { get; set; }
    public bool EnableCoverArt => !string.IsNullOrWhiteSpace(GiantBombApiKey);
}