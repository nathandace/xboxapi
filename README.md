# XboxApi

A local Xbox Live authentication and monitoring API, originally built to allow for Home Assistant to get information that the XBox add-on was not providing, such as supporting multiple user accounts and game cover art.
## 🎮 Overview

XboxApi solves a key limitation with Home Assistant's built-in Xbox integration: **multi-user support**. The existing HA Xbox integration only allows monitoring a single Xbox profile, but if multiple family members use the same Xbox console, you can't see who's currently playing or get status for secondary users.

You can run this API locally on a desktop, Raspberry Pi, or inside a Docker container — perfect for Home Assistant setups or headless environments. It's lightweight and designed to run 24/7 on your local network without exposing anything to the internet.

This API provides **multi-user Xbox monitoring** by authenticating with multiple Xbox Live accounts and aggregating their gaming status. Host it locally on your network, and Home Assistant can poll the endpoints to display comprehensive Xbox information for your entire household.



**Important:** This is a **monitoring/data retrieval API only** - it does not provide media player controls. It's designed to show you gaming activity, not control the Xbox.

## ✨ Features

- 🎮 **Multi-user Xbox Live authentication** - No Azure registration required
- 🧭 **Web-based login dashboard** - Web UI for authenticating and managing multiple Xbox users
- 🏠 **Xbox status detection** - On/Off/Dashboard states for Home Assistant
- 🎯 **Active game monitoring** - Real-time detection of what games are being played
- 👥 **Split-screen gaming support** - Identifies multiple users playing the same game
- 🖼️ **Game cover art integration** - Optional Giant Bomb API for game artwork
- 🔄 **Automatic token refresh** - Hands-off authentication management
- 💾 **Persistent storage** - Tokens survive server restarts
- 🛡️ **Local-only operation** - Secure, no external dependencies beyond Xbox Live

## 🆘 Help Wanted

We're looking for contributors to help improve the project! In particular:

- 🎨 **Front-End Overhaul**  

  The current web interface is very basic and not mobile-friendly. We’d love help with:
  - Responsive layout improvements  
  - Better styling and UI organization  
  - A polished status dashboard to display Xbox activity cleanly

- 🔐 **Improved Authentication UX**  
  Right now, users must manually copy a `code` from a redirected URL and paste it back into a POST request. Ideas for improving this flow—like auto-handling redirects or using a local callback page—would be awesome.

- 📊 **Dashboard Enhancements**  
  There's potential for a visual, user-friendly front-end that mirrors current Xbox activity and user status. Think: mini control center for who's online, what they're playing, with artwork and activity history.

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Xbox Live accounts to monitor
- (Optional) Giant Bomb API key for cover art

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/XboxApi.git
   cd XboxApi
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure the API (optional)**

   ```bash
   cp config.example.json config.json
   # Edit config.json to add your Giant Bomb API key for cover art
   ```

4. **Build and start**

   ```bash
   npm run build
   npm start
   ```

   Or for development:

   ```bash
   npm run dev
   ```

5. **Access the API**
   - API runs on `http://localhost:3000`
   - Health check: `http://localhost:3000/health`

## 🔐 Authentication Setup

### Step 1: Initiate Authentication

### ✅ Option 1: Use the Web UI (Recommended)

1. Start the server:  

   ```bash
   npm start
2. Open browser to <http://localhost:3000>
3. Use dashboard for authenticating to add user accounts.

### ✅ Option 2: Use API Calls

```bash
curl http://localhost:3000/auth/url/your-email@example.com
```

### Step 2: Complete Xbox Live Sign-in

1. Visit the `authUrl` returned from step 1 in your browser
2. Sign in with your Microsoft account
3. You'll be redirected to a page with a `code` parameter in the URL

### Step 3: Complete Authentication

```bash
curl -X POST http://localhost:3000/auth/callback/your-email@example.com \
  -H "Content-Type: application/json" \
  -d '{"code": "YOUR_CODE_FROM_STEP_2"}'
```

### Repeat for Multiple Users

Authenticate each Xbox Live account you want to monitor by repeating the above steps.

## 📊 API Endpoints

### Xbox Gaming Status

```bash
GET /xbox/status
```

**Perfect for Home Assistant polling**

Example response:

```json
{
  "success": true,
  "xboxStatus": "on",
  "activeGame": {
    "id": "1766989558",
    "name": "MLB The Show 25",
    "activity": "Playing MLB The Show 25",
    "coverArtUrl": "https://..."
  },
  "users": [
    {
      "username": "dad@email.com",
      "gamertag": "DadGamer123",
      "activity": "Playing MLB The Show 25"
    },
    {
      "username": "kid@email.com",
      "gamertag": "LittleGamer",
      "activity": "Playing MLB The Show 25"
    }
  ],
  "timestamp": "2025-07-25T15:45:00.000Z"
}
```

### Individual User Endpoints

- `GET /xbox/profile/{username}` - User Xbox profile
- `GET /xbox/presence/{username}` - User online presence
- `GET /xbox/friends/{username}` - User's friends list
- `GET /xbox/games/{username}` - User's recent games
- `GET /xbox/status/{username}` - Comprehensive user status

### Authentication Management

- `GET /auth/tokens/{username}` - Check token status
- `POST /auth/refresh/{username}` - Manually refresh tokens
- `GET /auth/header/{username}` - Get Xbox API authorization header

## 🏠 Home Assistant Integration

### REST Sensor Configuration

Add to your `configuration.yaml`:

```yaml
rest:
  - resource: "http://localhost:3000/xbox/status"
    scan_interval: 30
    sensor:
      - name: "Xbox Status"
        value_template: "{{ value_json.xboxStatus }}"
      - name: "Xbox Active Game"
        value_template: "{{ value_json.activeGame.name if value_json.activeGame else 'None' }}"
      - name: "Xbox Players"
        value_template: "{{ value_json.users | length }}"
      - name: "Xbox Cover Art"
        value_template: "{{ value_json.activeGame.coverArtUrl if value_json.activeGame and value_json.activeGame.coverArtUrl else '' }}"
```

### Dashboard Card Example

```yaml
type: custom:stack-in-card
cards:
  - type: picture-entity
    entity: sensor.xbox_status
    image: "{{ states('sensor.xbox_cover_art') if states('sensor.xbox_cover_art') != '' else '/local/xbox-default.png' }}"
    name: "{{ states('sensor.xbox_active_game') }}"
  - type: entities
    entities:
      - sensor.xbox_status
      - sensor.xbox_players
```

## ⚙️ Configuration

### Optional Cover Art (config.json)

```json
{
  "giantBombApiKey": "your-giant-bomb-api-key",
  "enableCoverArt": false
}
```

To enable cover art:

1. Get a free API key from [Giant Bomb](https://www.giantbomb.com/api/)
2. Add it to `config.json`
3. Restart the server

## 🗂️ Project Structure

```
src/
├── auth.ts          # Authentication service
├── authRoutes.ts    # Authentication endpoints  
├── index.ts         # Main server & Xbox API endpoints
├── config.json      # Local configuration (optional)
└── tokens.json      # Stored auth tokens (auto-generated)
```

## 🔧 Development

### Scripts

- `npm run build` - Compile TypeScript
- `npm run dev` - Development mode with auto-reload
- `npm start` - Start production server

### TypeScript Compilation

```bash
# Watch mode for development
npm run dev:build

# Single build
npm run build
```

## 🛡️ Security & Privacy

- **Local operation only** - No data sent to external services (except Xbox Live)
- **Tokens stored locally** - Authentication tokens remain on your network
- **No Xbox registration required** - Uses standard Xbox Live client ID
- **Optional external APIs** - Giant Bomb integration is completely optional

## 🚨 Troubleshooting

### Common Issues

**Xbox shows "off" when it should be "on":**

- Check that users are properly authenticated
- Verify Xbox accounts are signed in on the console

**Cover art not loading:**

- Ensure Giant Bomb API key is configured in `config.json`
- Check server logs for API errors

**Authentication failing:**

- Clear browser cookies and retry authentication
- Check that redirect URL code is copied correctly

### Debug Mode

Enable detailed logging by checking server console output during API calls.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Microsoft Xbox Live API
- [Giant Bomb API](https://www.giantbomb.com/api/) for game cover art
- Home Assistant community for inspiration

## 🔗 Links

- [Xbox Live API Documentation](https://docs.microsoft.com/en-us/gaming/xbox-live/)
- [Home Assistant REST Integration](https://www.home-assistant.io/integrations/rest/)
- [Giant Bomb API](https://www.giantbomb.com/api/)

---

**Built for local networks, designed for privacy, optimized for Home Assistant integration.**
