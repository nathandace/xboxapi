using System.Text.Json.Serialization;

namespace XboxApi.Models;

public class XboxTokenData
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("refresh_token")]
    public string RefreshToken { get; set; } = string.Empty;

    [JsonPropertyName("expires_in")]
    public int ExpiresIn { get; set; }

    [JsonPropertyName("expires_at")]
    public long ExpiresAt { get; set; }

    [JsonPropertyName("xbl_token")]
    public string XblToken { get; set; } = string.Empty;

    [JsonPropertyName("xsts_token")]
    public string XstsToken { get; set; } = string.Empty;

    [JsonPropertyName("user_hash")]
    public string UserHash { get; set; } = string.Empty;

    [JsonPropertyName("gamertag")]
    public string? Gamertag { get; set; }

    [JsonPropertyName("timestamp")]
    public long Timestamp { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    public bool IsExpired => DateTimeOffset.FromUnixTimeMilliseconds(ExpiresAt) <= DateTimeOffset.UtcNow;
    
    public bool IsExpiringSoon => DateTimeOffset.FromUnixTimeMilliseconds(ExpiresAt) <= DateTimeOffset.UtcNow.AddMinutes(10);
    
    public string AuthorizationHeader => $"XBL3.0 x={UserHash};{XstsToken}";
}

public class StateData
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public long Timestamp { get; set; }

    public bool IsExpired => DateTimeOffset.FromUnixTimeMilliseconds(Timestamp) <= DateTimeOffset.UtcNow.AddMinutes(-30);
}

public class XboxApiConfig
{
    public const string ClientId = "000000004C12AE6F";
    public const string RedirectUri = "https://login.live.com/oauth20_desktop.srf";
    public const string Scopes = "XboxLive.signin offline_access";
    public const string AuthorizeEndpoint = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
    public const string TokenEndpoint = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
}