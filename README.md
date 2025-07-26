# XboxApi

A local Xbox Live authentication and monitoring API, originally built to allow for Home Assistant to get information that the Xbox add-on was not providing, such as supporting multiple user accounts and game cover art.

## 🎮 Overview

XboxApi solves a key limitation with Home Assistant's built-in Xbox integration: **multi-user support**. The existing HA Xbox integration only allows monitoring a single Xbox profile, but if multiple family members use the same Xbox console, you can't see who's currently playing or get status for secondary users.

You can run this API locally on a desktop, Raspberry Pi, or inside a Docker container — perfect for Home Assistant setups or headless environments. It's lightweight and designed to run 24/7 on your local network without exposing anything to the internet.

This API provides **multi-user Xbox monitoring** by authenticating with multiple Xbox Live accounts and aggregating their gaming status. Host it locally on your network, and Home Assistant can poll the endpoints to display comprehensive Xbox information for your entire household.

**Important:** This is a **monitoring/data retrieval API only** - it does not provide media player controls. It's designed to show you gaming activity, not control the Xbox.

## ✨ Features

- 🎮 **Multi-user Xbox Live authentication** - No Azure registration required
- 🧭 **Web-based login dashboard** - Web UI for authenticating and managing multiple Xbox users
- 🏠 **Xbox status detection** - Real-time detection of active gaming sessions
- 🎯 **Active game monitoring** - Shows current game being played across all profiles
- 👥 **Split-screen gaming support** - Identifies multiple users playing the same game
- 🖼️ **Game cover art integration** - Optional Giant Bomb API for game artwork
- 🔄 **Automatic token refresh** - Hands-off authentication management
- 💾 **Persistent storage** - Tokens and gamertags survive server restarts
- 🛡️ **Local-only operation** - Secure, no external dependencies beyond Xbox Live
- ⚡ **Optimized performance** - Minimal API calls with intelligent caching

## 🆘 Help Wanted

We're looking for contributors to help improve the project! In particular:

- 🎨 **Front-End Overhaul**  
  The current web interface is functional but could be much better:
  - Responsive layout improvements  
  - Better styling and UI organization  
  - A polished status dashboard to display Xbox activity cleanly

- 🔐 **Improved Authentication UX**  
  Right now, users must manually copy a `code` from a redirected URL and paste it back. Ideas for improving this flow—like auto-handling redirects or using a local callback page—would be awesome.

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
   - Web dashboard: `http://localhost:3000` (for user management)

## 🔐 Authentication Setup

### Step 1: Initiate Authentication

### ✅ Option 1: Use the Web UI (Recommended)

1. Start the server:  

   ```bash
   npm start
   ```

2. Open browser to `http://localhost:3000`
3. Use the dashboard to authenticate and add user accounts
4. The web interface will guide you through the Xbox Live sign-in process

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

Authenticate each Xbox Live account you want to monitor by repeating the above steps. The API will automatically capture and store gamertags during authentication.

## 📊 API Endpoints

### Xbox Gaming Status

```bash
GET /xbox/status
```

**Perfect for Home Assistant polling - optimized and lightweight**

Example response:

```json
{
  "success": true,
  "activeGame": {
    "id": "1766989558",
    "name": "MLB® The Show™ 25",
    "coverArtUrl": "https://www.giantbomb.com/a/uploads/original/..."
  },
  "users": [
    {
      "username": "dad@email.com",
      "gamertag": "DadGamer123"
    },
    {
      "username": "kid@email.com", 
      "gamertag": "LittleGamer"
    }
  ]
}
```

### User Management

- `GET /api/users` - List all authenticated users with status
- `DELETE /api/users/{username}` - Remove a user's authentication
- `POST /auth/refresh/{username}` - Manually refresh user tokens

### Individual User Endpoints

- `GET /xbox/profile/{username}` - User Xbox profile
- `GET /xbox/presence/{username}` - User online presence  
- `GET /xbox/friends/{username}` - User's friends list
- `GET /xbox/games/{username}` - User's recent games

## 🏠 Home Assistant Integration

### REST Sensor Configuration

Add to your `configuration.yaml`:

```yaml
rest:
  - resource: "http://localhost:3000/xbox/status"
    scan_interval: 60
    method: GET
    timeout: 30
    sensor:
      # Xbox Active Game
      - name: "Xbox Active Game"
        unique_id: xbox_active_game
        value_template: >
          {% if value_json.activeGame and value_json.activeGame.name %}
            {{ value_json.activeGame.name }}
          {% else %}
            None
          {% endif %}
        json_attributes_path: "$"
        json_attributes:
          - "activeGame"
          - "users"
        icon: "mdi:gamepad-variant"
        
      # Xbox Active Players (shows gamertag names)
      - name: "Xbox Active Players"
        unique_id: xbox_active_players
        value_template: >
          {% if value_json.users and value_json.users | length > 0 %}
            {{ value_json.users | map(attribute='gamertag') | join(', ') }}
          {% else %}
            No players
          {% endif %}
        icon: "mdi:account-multiple"
        
      # Xbox Cover Art (handles long URLs)
      - name: "Xbox Cover Art"
        unique_id: xbox_cover_art
        value_template: >
          {% if value_json.activeGame and value_json.activeGame.coverArtUrl %}
            {% set url = value_json.activeGame.coverArtUrl %}
            {% if url | length < 250 %}
              {{ url }}
            {% else %}
              long_url
            {% endif %}
          {% else %}
            none
          {% endif %}
        json_attributes_path: "$.activeGame"
        json_attributes:
          - "coverArtUrl"
        icon: "mdi:image"
```

### Dashboard Card Examples

#### Simple Multi-Profile Xbox Card

```yaml
type: vertical-stack
cards:
  # Current Game
  - type: entity
    entity: sensor.xbox_active_game
    name: Current Game
    icon: mdi:gamepad-variant

  # Active Players
  - type: entity
    entity: sensor.xbox_active_players
    name: Active Players
    icon: mdi:account-multiple

  # Cover Art
  - type: markdown
    title: Game Cover
    content: |
      {% set cover_state = states('sensor.xbox_cover_art') %}
      {% if cover_state == 'long_url' %}
        ![Game Cover]({{ state_attr('sensor.xbox_cover_art', 'coverArtUrl') }})
      {% else %}
        ![Game Cover]({{ cover_state }})
      {% endif %}
```

#### Advanced Multi-Profile Card with Styling

```yaml
type: custom:stack-in-card
cards:
  - type: conditional
    conditions:
      - entity: sensor.xbox_active_game
        state_not: "None"
    card:
      type: picture-elements
      image: "{{ state_attr('sensor.xbox_cover_art', 'coverArtUrl') if states('sensor.xbox_cover_art') == 'long_url' else states('sensor.xbox_cover_art') }}"
      elements:
        - type: state-label
          entity: sensor.xbox_active_game
          style:
            top: 90%
            left: 50%
            color: white
            font-size: 14px
            font-weight: bold
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8)
  - type: entities
    entities:
      - entity: sensor.xbox_active_players
        name: "👥 Active Players"
      - entity: sensor.xbox_active_game
        name: "🎮 Current Game"
    show_header_toggle: false
```

## ⚙️ Configuration

### Optional Cover Art (config.json)

```json
{
  "giantBombApiKey": "your-giant-bomb-api-key",
  "enableCoverArt": true
}
```

To enable cover art:

1. Get a free API key from [Giant Bomb](https://www.giantbomb.com/api/)
2. Add it to `config.json`
3. Set `enableCoverArt` to `true`
4. Restart the server

## 🗂️ Project Structure

```
src/
├── auth.ts          # Enhanced authentication with gamertag capture
├── authRoutes.ts    # Authentication endpoints  
├── index.ts         # Main server & optimized Xbox API endpoints
├── config.json      # Local configuration (optional)
├── tokens.json      # Stored auth tokens with gamertags (auto-generated)
└── public/          # Web dashboard files
    ├── index.html   # User management interface
    └── styles.css   # Basic styling
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

## 🚀 Performance Optimizations

- **Gamertag caching** - Captured during authentication, no repeated profile API calls
- **Intelligent polling** - 60-second intervals prevent API rate limiting
- **Response caching** - 10-second cache reduces Xbox Live API load
- **Error handling** - Cover art failures don't break main functionality
- **Timeout management** - 30-second timeouts prevent hanging requests

## 🛡️ Security & Privacy

- **Local operation only** - No data sent to external services (except Xbox Live)
- **Tokens stored locally** - Authentication tokens remain on your network
- **No Xbox registration required** - Uses standard Xbox Live client ID
- **Optional external APIs** - Giant Bomb integration is completely optional
- **Automatic cleanup** - Expired authentication states are removed automatically

## 🚨 Troubleshooting

### Common Issues

**No gamertags showing (email addresses instead):**

- Re-authenticate users through the web dashboard
- Check that tokens.json contains `gamertag` fields for each user

**Xbox sensors show "unavailable" in Home Assistant:**

- Verify the API is running on `http://localhost:3000/xbox/status`
- Check Home Assistant logs for REST sensor errors
- Ensure scan_interval and timeout are appropriate for your setup

**Cover art not loading:**

- Ensure Giant Bomb API key is configured in `config.json`
- Check server logs for API errors
- Note: Some cover art URLs are very long and handled specially

**Authentication failing:**

- Clear browser cookies and retry authentication
- Check that redirect URL code is copied correctly
- Use the web dashboard for easier authentication

### Debug Mode

Enable detailed logging by checking server console output during API calls.

### Home Assistant Sensor Debugging

Check your sensors in **Developer Tools → States**:

- `sensor.xbox_active_game` should show game names
- `sensor.xbox_active_players` should show gamertags
- `sensor.xbox_cover_art` should show URLs or "long_url"

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
