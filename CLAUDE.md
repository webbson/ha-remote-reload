# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ha-remote-reload is a single-file JavaScript resource for Home Assistant that remotely reloads browser dashboards. It subscribes to `reload_dashboard` custom events via Home Assistant's WebSocket connection, with support for path-based filtering and debounced reloads. Distributed via HACS (Home Assistant Community Store).

## Development

There is no build system, package manager, or test framework. The project is a single vanilla JavaScript file (`ha-remote-reload.js`) deployed as-is.

**Manual testing:** Set `CONFIG.debug = true` in `ha-remote-reload.js` and fire test events from Home Assistant Developer Tools > Events. Check browser console for debug output.

## Architecture

`ha-remote-reload.js` is an IIFE (Immediately Invoked Function Expression) with these layers:

1. **Config** — `CONFIG` object with `defaultDelay`, `debounceMs`, `debug`, `stateEntityId`
2. **Utilities** — `log()`, `getCurrentPath()`, `pathMatches()`
3. **Reload scheduler** — `scheduleReload()` with debounce tracking via `lastReload` timestamp
4. **Event handlers** — `handleEvent()` for custom `reload_dashboard` events (admin only), `handleStateEvent()` for `state_changed` events on the configured `input_text` entity (all users). State trigger fires only on blank→non-empty transitions.
5. **WebSocket integration** — dual subscription model:
   - `subscribe()` subscribes to both `reload_dashboard` (custom event, admin) and `state_changed` (standard event, all users). Both `subscribeEvents()` calls return Promises; errors are caught and logged (non-admin users see a warning for the custom event).
   - `cleanupSubscriptions()` resolves unsub Promises via `.then()` before calling cleanup functions
   - `resubscribe()` cleans up old subscriptions and re-subscribes to a new connection
   - `init()` runs a two-phase health-check loop:
     - **Phase 1 (connecting):** Fast polls at 500ms, slows to 5s after 30s, never gives up
     - **Phase 2 (connected):** Health-checks every 10s via reference comparison (`getHassConnection() !== activeConn`), resubscribes if changed, drops back to Phase 1 if lost

State: `activeConn` tracks the current connection reference, `activeUnsubEvent` and `activeUnsubState` hold the Promise-wrapped unsubscribe functions.

Data flow: HA backend fires event → WebSocket delivers to browser → `handleEvent()` or `handleStateEvent()` checks path filter → `scheduleReload()` debounces and calls `location.reload()`.

## Key Conventions

- No external dependencies — vanilla JS only, targeting browser environment
- Event type is `reload_dashboard` (custom HA event)
- Path matching uses `startsWith()` prefix matching with leading-slash normalization
- Debounce window is 5 seconds to prevent reload storms
- The `home-assistant` custom element is queried from the DOM to access the `hass.connection` object
