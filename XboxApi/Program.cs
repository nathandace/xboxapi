using System.Text.Json;
using Serilog;
using XboxApi.Services;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .Enrich.FromLogContext()
    .CreateLogger();

builder.Host.UseSerilog();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.WriteIndented = true;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();

builder.Services.AddSingleton<IXboxAuthService, XboxAuthService>();
builder.Services.AddSingleton<IConfigService, ConfigService>();
builder.Services.AddScoped<IXboxApiService, XboxApiService>();

builder.Services.AddHttpClient("XboxAuthClient", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.Add("User-Agent", "Xbox-API-NET/1.0");
})
.AddStandardResilienceHandler();

builder.Services.AddHttpClient<IXboxApiService, XboxApiService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
    client.DefaultRequestHeaders.Add("User-Agent", "Xbox-API-NET/1.0");
})
.AddStandardResilienceHandler();

builder.Services.AddHttpClient<IConfigService, ConfigService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
    client.DefaultRequestHeaders.Add("User-Agent", "Xbox-API-NET/1.0");
});

builder.Services.AddHealthChecks();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.MapControllers();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var response = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(x => new
            {
                name = x.Key,
                status = x.Value.Status.ToString(),
                description = x.Value.Description,
                duration = x.Value.Duration.TotalMilliseconds
            }),
            duration = report.TotalDuration.TotalMilliseconds
        };
        await context.Response.WriteAsync(JsonSerializer.Serialize(response));
    }
});

var authService = app.Services.GetRequiredService<IXboxAuthService>();
await authService.LoadTokensAsync();

Log.Information("Xbox API starting on {Environment}", app.Environment.EnvironmentName);
Log.Information("Web Interface available at: http://localhost:5000");
Log.Information("Swagger UI available at: http://localhost:5000/swagger");

app.Run();
