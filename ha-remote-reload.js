/**
 * Home Assistant Remote Dashboard Reload
 *
 * Listens for a custom "reload_dashboard" event fired from HA (e.g. via an
 * automation or the developer tools) and reloads the browser tab if the
 * current dashboard path matches.
 *
 * See README.md for installation and usage instructions.
 *
 * @license MIT
 * @version 1.0.0
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
  };

  let lastReload = 0;

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

  function subscribe(conn) {
    log("Subscribing to", EVENT_TYPE, "events via WebSocket.");
    conn.subscribeEvents(function (event) {
      handleEvent(event);
    }, EVENT_TYPE);
  }

  function init() {
    log("Initializing (v1.0.0) — listening for", EVENT_TYPE, "events...");
    log("Current path:", getCurrentPath());

    let attempts = 0;
    const maxAttempts = 100;

    const interval = setInterval(function () {
      attempts++;
      const conn = getHassConnection();

      if (conn) {
        clearInterval(interval);
        subscribe(conn);
        log("Ready. Waiting for events.");
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        log(
          "ERROR: Could not get HA WebSocket connection after",
          maxAttempts,
          "attempts."
        );
      }
    }, 200);
  }

  init();
})();
