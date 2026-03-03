# ha-remote-reload

Remotely reload Home Assistant dashboards by firing a custom event. Useful for wall-mounted tablets, kiosk displays, and development workflows where you want to push dashboard changes without physically touching each device.

## How it works

This is a lightweight JavaScript resource that subscribes to a custom `reload_dashboard` event on Home Assistant's WebSocket connection. When the event is fired (from an automation, script, button, or Developer Tools), every browser tab running the script checks if its current path matches the optional filter — and reloads if it does.

No DOM scraping, no shadow DOM traversal, no dependency on specific HA frontend component versions.

## Installation

### Manual

1. Download `ha-remote-reload.js` from the [latest release](../../releases/latest).
2. Copy the file to your Home Assistant `config/www/` directory.
3. Add the resource in **Settings → Dashboards → Resources** (top-right three-dot menu):
   - **URL:** `/local/ha-remote-reload.js`
   - **Type:** JavaScript Module

Or add it in YAML:

```yaml
resources:
  - url: /local/ha-remote-reload.js
    type: module
```

> **Note:** The script must be loaded on every dashboard you want to be reloadable. Adding it as a global resource ensures it runs everywhere.

### HACS (Custom Repository)

1. Open HACS → Frontend → **Custom repositories** (three-dot menu).
2. Add this repository URL and select category **Dashboard**.
3. Search for "Remote Reload" and install.
4. Add the resource as described above (HACS may do this automatically).

## Usage

### Reload all dashboards

```yaml
action: homeassistant.fire_event
event_type: reload_dashboard
```

### Reload dashboards matching a path prefix

```yaml
action: homeassistant.fire_event
event_type: reload_dashboard
event_data:
  path: "/dev-dash"
```

This reloads any browser tab whose URL path starts with `/dev-dash` — so it matches `/dev-dash`, `/dev-dash/overview`, `/dev-dash/lights`, etc.

### Reload multiple specific paths

```yaml
action: homeassistant.fire_event
event_type: reload_dashboard
event_data:
  path:
    - "/dev-dash"
    - "/lovelace/kitchen"
```

### Custom delay

```yaml
action: homeassistant.fire_event
event_type: reload_dashboard
event_data:
  path: "/dev-dash"
  delay: 3000
```

Default delay is 500ms. Set `delay: 0` for immediate reload.

## Dashboard button example

Add a button card to any dashboard:

```yaml
type: button
name: Reload Dev Dashboards
icon: mdi:refresh
tap_action:
  action: perform-action
  perform_action: homeassistant.fire_event
  data:
    event_type: reload_dashboard
    event_data:
      path: "/dev-dash"
```

Reload all dashboards:

```yaml
type: button
name: Reload All Dashboards
icon: mdi:refresh
tap_action:
  action: perform-action
  perform_action: homeassistant.fire_event
  data:
    event_type: reload_dashboard
```

## Automation examples

### Reload tablets when Lovelace config changes

```yaml
automation:
  - alias: Reload tablets on dashboard change
    trigger:
      - trigger: event
        event_type: lovelace_updated
    action:
      - action: homeassistant.fire_event
        event_data:
          event_type: reload_dashboard
```

### Reload a specific dashboard after a deploy script

```yaml
automation:
  - alias: Reload dev dashboard after deploy
    trigger:
      - trigger: webhook
        webhook_id: deploy-complete
    action:
      - action: homeassistant.fire_event
        event_data:
          event_type: reload_dashboard
          event_data:
            path: "/dev-dash"
```

## Debugging

Open the browser console on any dashboard tab. Edit the script and set `debug: true` in the `CONFIG` object at the top:

```js
const CONFIG = {
  defaultDelay: 500,
  debounceMs: 5000,
  debug: true,   // ← enable logging
};
```

You'll see logs like:

```
[ha-remote-reload] Initializing (v1.0.0) — listening for reload_dashboard events...
[ha-remote-reload] Current path: /lovelace/0
[ha-remote-reload] Ready. Waiting for events.
[ha-remote-reload] Received event: { pathFilter: "/dev-dash", delay: 500, currentPath: "/dev-dash/overview" }
[ha-remote-reload] Path matches — will reload.
```

## Event reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | `string` or `string[]` | _(none — matches all)_ | Path prefix filter. Only tabs whose URL path starts with this value will reload. |
| `delay` | `number` | `500` | Milliseconds to wait before reloading. |

## Testing from Developer Tools

1. Go to **Developer Tools → Events**.
2. Set **Event type** to `reload_dashboard`.
3. Set **Event data** to `{}` (reload all) or `{ "path": "/your-dash" }`.
4. Click **Fire Event**.

## License

MIT
