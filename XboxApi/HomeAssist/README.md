# Home Assistant Integration for Xbox API (.NET)

This folder contains Home Assistant configuration files for integrating with the .NET Xbox API.

## Files

### `home-assistant-rest-config.yaml`
REST sensor configuration to add to your Home Assistant `configuration.yaml` file. This creates sensors for:
- Xbox Active Game
- Xbox Active Players  
- Xbox Cover Art
- API Health Status

### `home-assistant-dashboard-cards.yaml`
Lovelace dashboard card examples for displaying Xbox gaming data with various layouts:
- Simple status cards
- Advanced cards with cover art backgrounds
- Health monitoring cards
- Complete gaming dashboards

## Setup Instructions

### 1. Configure REST Sensors

1. Open your Home Assistant `configuration.yaml` file
2. Copy the contents of `home-assistant-rest-config.yaml` 
3. **Important:** Update the resource URLs to match your deployment:
   - Development: `http://localhost:5000`
   - Production: `http://your-pi-ip:5000` (replace with your Raspberry Pi IP)
4. Restart Home Assistant

### 2. Add Dashboard Cards

1. Go to your Home Assistant dashboard
2. Edit dashboard → Add Card → Manual Card
3. Copy any card configuration from `home-assistant-dashboard-cards.yaml`
4. Paste into the card configuration
5. Save the card

### 3. Optional: Add Placeholder Images

For better visual experience, add these optional images to your Home Assistant `www` folder:
- `xbox-placeholder.png` - Default image when no cover art is available
- `xbox-home.png` - Image to show when Xbox is on home screen

## Available Sensors

After configuration, you'll have these sensors:

| Sensor | Description |
|--------|-------------|
| `sensor.xbox_active_game` | Currently playing game name |
| `sensor.xbox_active_players` | List of active players |
| `sensor.xbox_cover_art` | Game cover art URL |
| `sensor.xbox_api_health_net` | API health status |

## Automation Examples

### Notify when a new game starts
```yaml
automation:
  - alias: "Xbox Game Started"
    trigger:
      platform: state
      entity_id: sensor.xbox_active_game
      from: "None"
    condition:
      condition: template
      value_template: "{{ trigger.to_state.state != 'unavailable' }}"
    action:
      service: notify.mobile_app_your_phone
      data:
        message: "Xbox game started: {{ states('sensor.xbox_active_game') }}"
```

### Log gaming sessions
```yaml
automation:
  - alias: "Log Xbox Gaming Session"
    trigger:
      platform: state
      entity_id: sensor.xbox_active_game
      to: "None"
    condition:
      condition: template
      value_template: "{{ trigger.from_state.state not in ['None', 'unavailable'] }}"
    action:
      service: logbook.log
      data:
        name: Xbox Gaming
        message: "Finished playing {{ trigger.from_state.state }}"
```

## Troubleshooting

### Sensors show "unavailable"
- Check that the Xbox API is running on the specified IP/port
- Verify network connectivity between Home Assistant and the API
- Check the API health endpoint: `http://your-api-ip:5000/health`

### Cover art not displaying
- Ensure Giant Bomb API key is configured in the Xbox API settings
- Check the Xbox API web interface at `http://your-api-ip:5000`
- Verify there's an active game being played

### API timeout errors
- Increase the `timeout` value in the REST configuration
- Check Xbox API logs for authentication issues
- Ensure Xbox Live tokens are valid

## Need Help?

1. Check the Xbox API web interface for status and configuration
2. Review Xbox API logs for errors
3. Test API endpoints manually using curl or browser
4. Verify Home Assistant logs for REST sensor errors