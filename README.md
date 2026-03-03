# ha-remote-reload

Remotely reload Home Assistant dashboards by firing a custom event. Useful for wall-mounted tablets, kiosk displays, and development workflows where you want to push dashboard changes without physically touching each device.

## How it works

This is a lightweight JavaScript resource that listens for reload triggers on Home Assistant's WebSocket connection. It supports two methods out of the box:

- **Custom event** (`reload_dashboard`) — full-featured with path filtering, delay, and multi-path support. Requires admin user sessions.
- **State trigger** (`input_text.reload_dashboard`) — set the entity value to a path and matching tabs reload. Works for all users including non-admin kiosk accounts.

Both are always active. The script continuously monitors the connection and automatically resubscribes after HA restarts or network interruptions — ideal for wall-mounted kiosk displays running 24/7.

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

## Setup

The script supports two trigger methods. Both are active by default and share the same path matching and debounce logic.

| Method | Requires | Supports | Best for |
|--------|----------|----------|----------|
| **Custom event** (`reload_dashboard`) | Admin user | Path filter, delay, multiple paths | Admin dashboards, Developer Tools |
| **State trigger** (`input_text`) | Any user | Path filter | Kiosk displays, non-admin accounts |

### State trigger setup

The state trigger watches `input_text.reload_dashboard` out of the box. Create the helper:

1. Go to **Settings → Devices & Services → Helpers → Create Helper → Text**.
2. Name it `reload_dashboard` (entity ID: `input_text.reload_dashboard`).

That's it — no script editing needed. If the helper doesn't exist, the state trigger simply has no effect.

> To use a different entity ID, edit `stateEntityId` in the `CONFIG` object at the top of `ha-remote-reload.js`.

## Usage

### Method 1: Custom event (admin users)

```yaml
# Reload all dashboards
action: homeassistant.fire_event
event_type: reload_dashboard
```

```yaml
# Reload dashboards matching a path prefix
action: homeassistant.fire_event
event_type: reload_dashboard
event_data:
  path: "/dev-dash"
```

This reloads any browser tab whose URL path starts with `/dev-dash` — so it matches `/dev-dash`, `/dev-dash/overview`, `/dev-dash/lights`, etc.

```yaml
# Reload multiple specific paths
action: homeassistant.fire_event
event_type: reload_dashboard
event_data:
  path:
    - "/dev-dash"
    - "/lovelace/kitchen"
```

```yaml
# Custom delay (default is 500ms, set delay: 0 for immediate)
action: homeassistant.fire_event
event_type: reload_dashboard
event_data:
  path: "/dev-dash"
  delay: 3000
```

### Method 2: State trigger (all users)

Set the `input_text.reload_dashboard` value to `/` to reload all dashboards, or a path prefix to reload matching tabs only. The script triggers when the value changes from empty to non-empty, so clear it afterwards:

```yaml
# Reload all dashboards
action:
  - action: input_text.set_value
    target:
      entity_id: input_text.reload_dashboard
    data:
      value: "/"
  - delay: 1
  - action: input_text.set_value
    target:
      entity_id: input_text.reload_dashboard
    data:
      value: ""
```

```yaml
# Reload only dashboards under /lovelace
action:
  - action: input_text.set_value
    target:
      entity_id: input_text.reload_dashboard
    data:
      value: "/lovelace"
  - delay: 1
  - action: input_text.set_value
    target:
      entity_id: input_text.reload_dashboard
    data:
      value: ""
```

## Helper scripts

Reusable HA scripts that wrap both methods. Add to `scripts.yaml` (or via **Settings → Automations & Scenes → Scripts**).

### Custom event script (admin users)

```yaml
reload_dashboard_event:
  alias: Reload Dashboard (Event)
  description: Reload browser dashboards via custom event. Requires admin user sessions.
  fields:
    path:
      description: Path prefix to reload (e.g. "/lovelace"). Omit to reload all dashboards.
      example: "/lovelace"
      selector:
        text:
    delay:
      description: Milliseconds to wait before reloading.
      default: 500
      example: "1000"
      selector:
        number:
          min: 0
          max: 10000
          unit_of_measurement: ms
  sequence:
    - action: homeassistant.fire_event
      event_type: reload_dashboard
      event_data:
        path: "{{ path | default(omit) }}"
        delay: "{{ delay | default(omit) }}"
  mode: single
```

### State trigger script (all users)

```yaml
reload_dashboard:
  alias: Reload Dashboard
  description: Reload browser dashboards via input_text state trigger. Works for all users.
  fields:
    path:
      description: Path prefix to reload (e.g. "/lovelace"). Defaults to "/" (all dashboards).
      default: "/"
      example: "/lovelace"
      selector:
        text:
  sequence:
    - action: input_text.set_value
      target:
        entity_id: input_text.reload_dashboard
      data:
        value: "{{ path | default('/') }}"
    - delay: 1
    - action: input_text.set_value
      target:
        entity_id: input_text.reload_dashboard
      data:
        value: ""
  mode: single
```

### Calling the scripts

```yaml
# Reload all dashboards (state trigger — works for any user)
action: script.reload_dashboard

# Reload a specific path (state trigger)
action: script.reload_dashboard
data:
  path: "/lovelace"

# Reload all dashboards (custom event — admin only)
action: script.reload_dashboard_event

# Reload with custom path and delay (custom event — admin only)
action: script.reload_dashboard_event
data:
  path: "/dev-dash"
  delay: 3000
```

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
  stateEntityId: "input_text.reload_dashboard",   // ← enabled by default
};
```

You'll see logs like:

```
[ha-remote-reload] Initializing (v1.2.0) — listening for reload_dashboard events...
[ha-remote-reload] State trigger enabled for input_text.reload_dashboard
[ha-remote-reload] Current path: /lovelace/0
[ha-remote-reload] Ready. Waiting for events.
```

When a custom event fires:

```
[ha-remote-reload] Received event: { pathFilter: "/dev-dash", delay: 500, currentPath: "/dev-dash/overview" }
[ha-remote-reload] Path matches — will reload.
```

When the state trigger fires:

```
[ha-remote-reload] State trigger: { entity: "input_text.reload_dashboard", value: "/", pathFilter: "(all)", currentPath: "/lovelace/0" }
[ha-remote-reload] Path matches — will reload.
```

If the custom event subscription fails (non-admin user):

```
[ha-remote-reload] Warning: Could not subscribe to reload_dashboard (requires admin): ...
```

After an HA restart or network drop:

```
[ha-remote-reload] Connection changed — resubscribing.
[ha-remote-reload] Resubscribed.
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
