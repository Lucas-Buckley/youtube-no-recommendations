(() => {
  "use strict";

  const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown"]);
  const shortsPath = /^\/shorts(?:\/|$)/;
  const watchPath = /^\/watch\/?$/;
  const panels = "ytd-engagement-panel-section-list-renderer, panel-container, bottom-sheet-container, [role='dialog'], [role='menu']";
  const sliders = "[role='slider'], .ytp-progress-bar-container, .ytp-volume-panel, input[type='range']";
  const playerSelector = "#movie_player, #shorts-player";
  const autoplayOn = ".ytp-autonav-toggle-button[aria-checked='true']";
  const autoplayToggle = ".ytp-autonav-toggle-button";
  // YouTube's mobile player uses 1 for its disabled autonav state.
  const autonavDisabled = 1;
  let framePending = false;

  function openStandaloneVideo() {
    if (!watchPath.test(location.pathname)) return false;
    const url = new URL(location.href);
    if (!url.searchParams.get("v") || !url.searchParams.has("list")) return false;

    // YouTube advances playlists independently of its Autoplay switch.
    for (const key of ["list", "index", "start_radio", "playnext"]) url.searchParams.delete(key);
    location.replace(url.href);
    return true;
  }

  if (openStandaloneVideo()) return;

  function stopScrolling(event) {
    if (!shortsPath.test(location.pathname) || event.target.closest?.(panels)) return;
    if (event.type === "wheel" && (event.ctrlKey || !event.deltaY)) return;
    if (event.type === "touchmove" && (event.touches.length !== 1 || event.target.closest?.(sliders))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function stopNavigationKeys(event) {
    const target = event.target;
    if (target.isContentEditable || target.closest?.("input, textarea, select, " + panels)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const path = location.pathname;
    const shorts = shortsPath.test(path);
    const nextKey = event.shiftKey && event.code === "KeyN";
    if ((shorts && scrollKeys.has(event.key)) || (nextKey && (shorts || watchPath.test(path)))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function disableAutoAdvance() {
    if (openStandaloneVideo()) return;
    const path = location.pathname;
    if (shortsPath.test(path)) {
      document.querySelector("#shorts-player")?.setShortsAutoAdvancedEnabled?.(false);
    } else if (watchPath.test(path)) {
      const player = document.querySelector("#movie_player");
      if (!player) return;
      const toggle = player.querySelector(autoplayToggle);
      if (toggle?.matches(autoplayOn)) {
        (toggle.closest("button, [role='button']") || toggle).click();
      } else if (!toggle) {
        player.setAutonavState?.(autonavDisabled);
      }
    }
  }

  function schedulePlaybackCheck() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      disableAutoAdvance();
    });
  }

  // A player can be created or reused after the route and initial DOM are ready.
  const controls = new MutationObserver((changes) => {
    if (!watchPath.test(location.pathname)) return;
    if (changes.some(change => change.target.matches?.(autoplayToggle) ||
      Array.from(change.addedNodes).some(node => node.matches?.(autoplayToggle) || node.querySelector?.(autoplayToggle)))) {
      schedulePlaybackCheck();
    }
  });
  controls.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ["aria-checked"]});

  window.addEventListener("keydown", stopNavigationKeys, true);
  window.addEventListener("wheel", stopScrolling, {capture: true, passive: false});
  window.addEventListener("touchmove", stopScrolling, {capture: true, passive: false});
  for (const type of ["loadedmetadata", "playing", "ended"]) {
    window.addEventListener(type, event => {
      if (event.target.matches?.("video") && event.target.closest(playerSelector)) disableAutoAdvance();
    }, true);
  }
  document.addEventListener("yt-navigate-finish", schedulePlaybackCheck);
  window.navigation?.addEventListener("currententrychange", schedulePlaybackCheck);

  // Back/Forward and explicit browser navigation can still open a different Short.
  window.navigation?.addEventListener("navigate", event => {
    const next = new URL(event.destination.url);
    if (event.cancelable && !event.userInitiated && event.navigationType !== "traverse" &&
      shortsPath.test(location.pathname) && shortsPath.test(next.pathname) &&
      next.origin === location.origin && next.pathname !== location.pathname) {
      event.preventDefault();
    }
  });

  schedulePlaybackCheck();
})();
