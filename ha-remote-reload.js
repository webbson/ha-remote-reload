/**
 * Home Assistant Remote Dashboard Reload
 *
 * Listens for a custom "reload_dashboard" event fired from HA (e.g. via an
 * automation or the developer tools) and reloads the browser tab if the
 * current dashboard path matches.
 *
 * Also supports a state-based trigger via an input_text helper entity,
 * which works for non-admin users (custom events require admin access).
 *
 * See README.md for installation and usage instructions.
 *
 * @license MIT
 * @version 1.2.0
 */

(function () {
  "use strict";

  const EVENT_TYPE = "reload_dashboard";

  const CONFIG = {
    // Default delay before reload (ms). Can be overridden per-event.
    defaultDelay: 500,
    // Debounce window (ms) to prevent multiple rapid reloads.
    debounceMs: 5000,
    // Enable console logging.
    debug: false,
    // State-based trigger: entity ID of an input_text helper.
    // Set the entity value to "/" to reload all dashboards, or a path
    // prefix (e.g. "/lovelace") to reload matching tabs only.
    // Requires creating the helper in HA (see README). Works for all
    // users including non-admin. Set to "" to disable.
    stateEntityId: "input_text.reload_dashboard",
  };

  let lastReload = 0;
  let activeConn = null;
  let activeUnsubEvent = null;
  let activeUnsubState = null;

  function log(...args) {
    if (CONFIG.debug) {
      console.log("[ha-remote-reload]", ...args);
    }
  }

  /**
   * Returns the current dashboard path, e.g. "/lovelace/0", "/dev-dash/overview"
   */
  function getCurrentPath() {
    return window.location.pathname;
  }

  /**
   * Check if the current path matches the filter(s) from the event.
   *
   * @param {string | string[] | undefined} pathFilter
   * @returns {boolean}
   */
  function pathMatches(pathFilter) {
    // No filter = reload all dashboards
    if (pathFilter === undefined || pathFilter === null || pathFilter === "") {
      return true;
    }

    const currentPath = getCurrentPath();
    const filters = Array.isArray(pathFilter) ? pathFilter : [pathFilter];

    return filters.some((filter) => {
      if (typeof filter !== "string") return false;
      const normalizedFilter = filter.startsWith("/") ? filter : "/" + filter;
      return currentPath.startsWith(normalizedFilter);
    });
  }

  /**
   * Schedule a page reload with debounce protection.
   */
  function scheduleReload(delay, reason) {
    const now = Date.now();
    if (now - lastReload < CONFIG.debounceMs) {
      log("Reload suppressed (debounce). Reason:", reason);
      return;
    }
    lastReload = now;

    log("Scheduling reload in", delay + "ms. Reason:", reason);
    setTimeout(() => {
      log("Reloading page now.");
      location.reload();
    }, delay);
  }

  /**
   * Handle a reload_dashboard event from the WebSocket.
   */
  function handleEvent(event) {
    const data = event.data || {};
    const pathFilter = data.path;
    const delay =
      typeof data.delay === "number" ? data.delay : CONFIG.defaultDelay;

    log("Received event:", {
      pathFilter: pathFilter || "(all)",
      delay,
      currentPath: getCurrentPath(),
    });

    if (pathMatches(pathFilter)) {
      log("Path matches — will reload.");
      scheduleReload(delay, "event path=" + (pathFilter || "*"));
    } else {
      log(
        "Path does not match. Current:",
        getCurrentPath(),
        "filter:",
        pathFilter
      );
    }
  }

  /**
   * Handle a state_changed event for the configured input_text entity.
   * Only triggers when the value changes from empty to non-empty.
   */
  function handleStateEvent(event) {
    const data = event.data || {};
    if (data.entity_id !== CONFIG.stateEntityId) return;

    // Skip synthetic events fired on initial subscription
    if (!data.old_state) return;

    const oldVal = (data.old_state.state || "").trim();
    const newVal = ((data.new_state && data.new_state.state) || "").trim();

    // Only trigger on blank → non-empty transitions
    if (oldVal !== "" || newVal === "") return;

    // "/" means reload all, otherwise use as path filter
    const pathFilter = newVal === "/" ? undefined : newVal;

    log("State trigger:", {
      entity: CONFIG.stateEntityId,
      value: newVal,
      pathFilter: pathFilter || "(all)",
      currentPath: getCurrentPath(),
    });

    if (pathMatches(pathFilter)) {
      log("Path matches — will reload.");
      scheduleReload(CONFIG.defaultDelay, "state entity=" + CONFIG.stateEntityId + " path=" + (pathFilter || "*"));
    } else {
      log(
        "Path does not match. Current:",
        getCurrentPath(),
        "filter:",
        pathFilter
      );
    }
  }

  // ─── Connect to HA WebSocket ───────────────────────────────────────────

  function getHassConnection() {
    const ha = document.querySelector("home-assistant");
    if (ha) {
      const hass = ha.hass || ha.__hass;
      if (hass && hass.connection) {
        return hass.connection;
      }
    }
    return null;
  }

  function cleanupSubscriptions() {
    if (activeUnsubEvent) {
      activeUnsubEvent.then(function (unsub) {
        try { unsub(); } catch (_) { /* ignore */ }
      }).catch(function () {});
      activeUnsubEvent = null;
    }
    if (activeUnsubState) {
      activeUnsubState.then(function (unsub) {
        try { unsub(); } catch (_) { /* ignore */ }
      }).catch(function () {});
      activeUnsubState = null;
    }
  }

  function subscribe(conn) {
    log("Subscribing to", EVENT_TYPE, "events via WebSocket.");
    activeUnsubEvent = conn.subscribeEvents(function (event) {
      handleEvent(event);
    }, EVENT_TYPE);
    activeUnsubEvent.catch(function (err) {
      log("Warning: Could not subscribe to", EVENT_TYPE, "(requires admin):", err.message || err);
      activeUnsubEvent = null;
    });

    if (CONFIG.stateEntityId) {
      log("Subscribing to state changes for", CONFIG.stateEntityId);
      activeUnsubState = conn.subscribeEvents(function (event) {
        handleStateEvent(event);
      }, "state_changed");
      activeUnsubState.catch(function (err) {
        log("Error: Could not subscribe to state_changed:", err.message || err);
        activeUnsubState = null;
      });
    }

    activeConn = conn;
  }

  function resubscribe(newConn) {
    cleanupSubscriptions();
    activeConn = null;
    subscribe(newConn);
    log("Resubscribed.");
  }

  function init() {
    log("Initializing (v1.2.0) — listening for", EVENT_TYPE, "events...");
    if (CONFIG.stateEntityId) {
      log("State trigger enabled for", CONFIG.stateEntityId);
    }
    log("Current path:", getCurrentPath());

    var FAST_MS = 500;
    var SLOW_MS = 5000;
    var HEALTH_MS = 10000;
    var SLOW_AFTER_MS = 30000;

    var elapsed = 0;
    var pollMs = FAST_MS;
    var lastWarnAt = 0;
    var handle;

    function tick() {
      var conn = getHassConnection();

      if (!activeConn) {
        // Phase 1: waiting for initial connection (or reconnecting after loss)
        if (conn) {
          subscribe(conn);
          log("Ready. Waiting for events.");
          clearInterval(handle);
          handle = setInterval(tick, HEALTH_MS);
          return;
        }

        elapsed += pollMs;
        if (elapsed >= SLOW_AFTER_MS && pollMs !== SLOW_MS) {
          clearInterval(handle);
          pollMs = SLOW_MS;
          handle = setInterval(tick, pollMs);
          log("Still waiting for HA connection (slowing poll to 5s)...");
        }
        var now = Date.now();
        if (now - lastWarnAt >= 60000) {
          lastWarnAt = now;
          log("WARNING: HA connection not available yet, still trying...");
        }
      } else {
        // Phase 2: connected — health-check for connection replacement
        if (conn !== activeConn) {
          if (conn) {
            log("Connection changed — resubscribing.");
            resubscribe(conn);
          } else {
            log("Connection lost — waiting for reconnect.");
            cleanupSubscriptions();
            activeConn = null;
            clearInterval(handle);
            pollMs = FAST_MS;
            elapsed = 0;
            handle = setInterval(tick, pollMs);
          }
        }
      }
    }

    handle = setInterval(tick, pollMs);
  }

  init();
})();
