# Xbox API

A robust, production-ready .NET Web API for Xbox Live authentication and data retrieval with improved reliability, performance, and maintainability.

## 🛠️ Prerequisites

### Development
- .NET SDK
- Visual Studio 2022 or VS Code

### Raspberry Pi Deployment
- Raspberry Pi 4 (recommended) with ARM64 OS
- .NET Runtime (automatically handled by deployment script)

## 📦 Quick Start

### Local Development

1. **Clone and navigate to project folder**:
   ```bash
   cd XboxApi
   ```

2. **Run the application**:
   ```bash
   dotnet run
   ```

3. **Open Management UI**: http://localhost:5000

   **Alternative**: View API documentation at http://localhost:5000/swagger

## 👤 User Authentication

The Xbox API requires users to authenticate with their Microsoft accounts to access Xbox Live data. The built-in web interface makes this process straightforward.

### Adding Your First User

1. **Open the Management UI**: Navigate to http://localhost:5000
2. **Enter Microsoft Email**: In the "Add New User" section, enter the email address associated with your Microsoft/Xbox account
3. **Click "Add User"**: This opens a Microsoft authentication popup
4. **Sign In**: Complete the Microsoft OAuth flow in the popup window
5. **Copy Redirect URL**: After signing in, copy the entire URL from the popup's address bar (starts with `https://login.live.com/oauth20_desktop.srf?code=...`)
6. **Paste & Complete**: Paste the full URL into the text box and click "Complete Authentication"
7. **Success!**: Your Xbox account is now authenticated and will appear in the user list

### Authentication Notes

- **Email Requirement**: You must enter the exact email address you'll use to sign in to Microsoft
- **Token Lifespan**: Xbox tokens last approximately 90 days and will auto-refresh when possible
- **Multiple Users**: Add multiple Xbox accounts by repeating the process
- **Re-authentication**: Use the "Re-auth" button when tokens expire

### Raspberry Pi Deployment

1. **Update deployment script** with your Pi's IP:
   ```bash
   nano deploy.sh
   # Update PI_HOST and PI_NAME variables
   ```

2. **Deploy to Pi**:
   ```bash
   ./deploy.sh
   ```

3. **Access API**: http://YOUR_PI_IP:5000

## 🔧 API Endpoints

### Authentication
- `GET /auth/url?username={username}` - Get OAuth URL
- `POST /auth/callback?code={code}&state={state}` - Exchange code for tokens
- `GET /auth/status?username={username}` - Check auth status
- `POST /auth/refresh?username={username}` - Refresh tokens

### Xbox Data
- `GET /xbox/profile/{username}` - Get Xbox profile
- `GET /xbox/presence/{username}` - Get Xbox presence
- `GET /xbox/friends/{username}` - Get friends list
- `GET /xbox/games/{username}` - Get recent games
- `GET /xbox/status/{username}` - Get comprehensive status
- `GET /xbox/status` - **Main endpoint for Home Assistant**
- `GET /xbox/status-all` - Get all users' status
- `GET /xbox/game/{gameId}/players` - Get players in specific game

### User Management
- `GET /api/users` - List authenticated users
- `DELETE /api/users/{username}` - Remove user

### System
- `GET /health` - Health check
- `GET /metrics` - Performance metrics
- `GET /api/config` - Get cover art configuration
- `PUT /api/config` - Update cover art configuration

## 🏥 Health Monitoring

The API includes comprehensive health monitoring:

```bash
# Check overall health
curl http://localhost:5000/health

# Get detailed metrics
curl http://localhost:5000/metrics
```

### Metrics Include:
- Request statistics (total, success, failure rates)
- Response times and performance
- Memory usage and garbage collection
- HTTP client connection pooling stats
- Cache hit rates
- Token refresh statistics

## 📊 Home Assistant Integration

Configure your Home Assistant to use the Xbox API:

```yaml
rest:
  - resource: "http://192.168.1.10:5000/xbox/status"
    scan_interval: 60
    timeout: 30
    headers:
      User-Agent: "Home Assistant Xbox Integration"
```

For detailed Home Assistant configuration examples and dashboard cards, see the [Home Assistant Integration Guide](XboxApi/HomeAssist/README.md).

## 🛠️ Development

### Project Structure
```
XboxApi/
├── Controllers/          # API controllers
├── Services/            # Business logic and Xbox API calls
├── Models/              # Data models and responses
├── HomeAssist/          # Home Assistant configuration files
└── wwwroot/             # Static web files
```

### Key Services
- `XboxAuthService`: Token management and OAuth flow
- `XboxApiService`: Xbox Live API calls with retry policies
- `MetricsService`: Performance and usage tracking
- `XboxApiHealthCheck`: Service health monitoring

### Adding New Features
1. Create models in `Models/`
2. Add service methods in `Services/`
3. Create controller endpoints in `Controllers/`
4. Update health checks if needed

## 🐳 Production Deployment

The deployment script creates a systemd service with:
- Automatic restart on failure
- Resource limits
- Log rotation
- Service monitoring

### Service Management
```bash
# Check status
sudo systemctl status xbox-api-dotnet

# View logs
sudo journalctl -u xbox-api-dotnet -f

# Restart service
sudo systemctl restart xbox-api-dotnet

# Stop service
sudo systemctl stop xbox-api-dotnet
```

## 🎮 Web Management Interface

The Xbox API includes a built-in web interface for easy management:

### Features
- **User Management**: Add, remove, and re-authenticate Xbox users
- **Real-time Status**: View current gaming activity and active players
- **Cover Art**: Configure Giant Bomb API integration for game artwork
- **Health Monitoring**: Check API status and performance metrics
- **Token Management**: Monitor token expiration and refresh status

### Cover Art Configuration
1. Get a free API key from [Giant Bomb API](https://www.giantbomb.com/api/)
2. Enter the API key in the "Cover Art Settings" section
3. Save the configuration to enable game cover art in Home Assistant

### User Status Indicators
- **🟢 Green**: User authenticated and tokens valid
- **🟡 Yellow**: Tokens expiring soon (≤14 days)
- **🔴 Red**: Tokens expired, re-authentication required

## 📝 Logging

Logs are written to:
- **Console**: Structured logs during development
- **systemd**: Available via `journalctl` in production

### Log Levels:
- **Information**: Normal operations
- **Warning**: Retry attempts, circuit breaker events
- **Error**: Failed operations, exceptions
- **Debug**: Detailed HTTP requests (development only)

## 🚨 Troubleshooting

### Common Issues:

1. **Authentication Failed**:
   - Ensure you're using the correct Microsoft email address
   - Check that you copied the complete redirect URL (starts with `https://login.live.com/`)
   - Try clearing browser cookies for Microsoft login
   - Verify the popup window wasn't blocked by your browser

2. **Service won't start**:
   ```bash
   sudo journalctl -u xbox-api-dotnet --no-pager -l
   ```

3. **High memory usage**:
   ```bash
   curl http://localhost:5000/metrics
   # Check memory section
   ```

4. **Connection errors**:
   ```bash
   curl http://localhost:5000/health
   # Check Xbox API health status
   ```

5. **Token issues**:
   ```bash
   curl http://localhost:5000/api/users
   # Check user authentication status
   ```

6. **Cover art not working**:
   - Verify Giant Bomb API key is valid and saved
   - Check that "Enable Cover Art" is turned on
   - Some games may not have cover art available

## 📈 Performance

Typical performance characteristics:
- **Memory**: 30-60MB under normal load
- **Response Time**: <100ms for cached responses
- **Startup Time**: <5 seconds
- **Connection Pool**: Automatically managed, no manual cleanup needed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License

---

**Need Help?** Check the health endpoint first, then review the logs. The API includes comprehensive error reporting and diagnostics.