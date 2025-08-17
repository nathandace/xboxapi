using System.Text.Json.Serialization;

namespace XboxApi.Models;

public class GiantBombImage
{
    [JsonPropertyName("original_url")]
    public string? OriginalUrl { get; set; }
}