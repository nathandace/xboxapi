using System.Text.Json.Serialization;

namespace XboxApi.Models;

// Xbox Live API Response Models
public class XboxProfile
{
    [JsonPropertyName("profileUsers")]
    public List<ProfileUser> ProfileUsers { get; set; } = new();
}

public class ProfileUser
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("hostId")]
    public string HostId { get; set; } = string.Empty;

    [JsonPropertyName("settings")]
    public List<ProfileSetting> Settings { get; set; } = new();
}

public class ProfileSetting
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public object Value { get; set; } = string.Empty;
}

public class XboxPresence
{
    [JsonPropertyName("xuid")]
    public string Xuid { get; set; } = string.Empty;

    [JsonPropertyName("state")]
    public string State { get; set; } = string.Empty;

    [JsonPropertyName("devices")]
    public List<Device> Devices { get; set; } = new();
}

public class Device
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("titles")]
    public List<Title> Titles { get; set; } = new();
}

public class Title
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("state")]
    public string State { get; set; } = string.Empty;

    [JsonPropertyName("placement")]
    public string Placement { get; set; } = string.Empty;

    [JsonPropertyName("activity")]
    public Activity? Activity { get; set; }
}

public class Activity
{
    [JsonPropertyName("richPresence")]
    public string RichPresence { get; set; } = string.Empty;
}

public class XboxFriends
{
    [JsonPropertyName("people")]
    public List<Friend> People { get; set; } = new();
}

public class Friend
{
    [JsonPropertyName("xuid")]
    public string Xuid { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("realName")]
    public string RealName { get; set; } = string.Empty;

    [JsonPropertyName("displayPicRaw")]
    public string DisplayPicRaw { get; set; } = string.Empty;

    [JsonPropertyName("presenceState")]
    public string PresenceState { get; set; } = string.Empty;

    [JsonPropertyName("presenceText")]
    public string PresenceText { get; set; } = string.Empty;
}

public class XboxGames
{
    [JsonPropertyName("titles")]
    public List<GameTitle> Titles { get; set; } = new();
}

public class GameTitle
{
    [JsonPropertyName("titleId")]
    public string TitleId { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("displayImage")]
    public string DisplayImage { get; set; } = string.Empty;

    [JsonPropertyName("lastPlayed")]
    public DateTime? LastPlayed { get; set; }

    [JsonPropertyName("titleHistory")]
    public TitleHistory? TitleHistory { get; set; }
}

public class TitleHistory
{
    [JsonPropertyName("lastTimePlayed")]
    public DateTime? LastTimePlayed { get; set; }
}

// API Response Models
public class XboxStatusResponse
{
    public bool Success { get; set; } = true;
    public ActiveGame? ActiveGame { get; set; }
    public List<UserInGame> Users { get; set; } = new();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class ActiveGame
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? CoverArtUrl { get; set; }
    public string? DeviceType { get; set; }
    public string? RichPresence { get; set; }
}

public class UserInGame
{
    public string Username { get; set; } = string.Empty;
    public string Gamertag { get; set; } = string.Empty;
}

public class UserStatusResponse
{
    public bool Success { get; set; } = true;
    public string Username { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public XboxProfile? Profile { get; set; }
    public XboxPresence? Presence { get; set; }
    public XboxGames? RecentGames { get; set; }
    public string? ProfileError { get; set; }
    public string? PresenceError { get; set; }
    public string? GamesError { get; set; }
}

public class ApiResponse<T>
{
    public bool Success { get; set; } = true;
    public T? Data { get; set; }
    public string? Error { get; set; }
    public string? Action { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class AuthenticatedUser
{
    public string Username { get; set; } = string.Empty;
    public string Gamertag { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? TokenExpiry { get; set; }
    public int TokenAge { get; set; }
    public int EstimatedRefreshDaysLeft { get; set; }
    public DateTime? AuthTimestamp { get; set; }
}