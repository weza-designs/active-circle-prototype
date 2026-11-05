// Shared dark/light theme toggle for every screen in the prototype
// (generated screens and the hand-authored .dc.html design-canvas screens
// alike). Loaded as the very first thing in <head>, before the stylesheet,
// so the saved preference is applied before first paint — no flash of the
// wrong theme on navigation between pages.
//
// Each screen's CSS defines its palette as custom properties on :root
// (dark, the default) and :root[data-theme="light"] (the override) — see
// THEME_VARS in gen.py for generated screens, and the matching block
// patched into each .dc.html file's own <style> tag. This script only
// decides which one applies and persists the choice; it never hardcodes
// colors itself.
//
// Storage is a per-viewer convenience (remembered UI preference), not
// state that needs to persist reliably or be shared — exactly the
// localStorage use case, wrapped in try/catch since this prototype also
// runs from file:// and from inside a sandboxed artifact preview, where
// storage access can throw or silently return nothing.
(function () {
  var KEY = "ac-theme";

  function getSaved() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function save(theme) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch (e) {
      /* best-effort only — the toggle still works for this page view */
    }
  }

  function apply(theme) {
    var root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }

  // Apply immediately — this script runs before <body>, so there is no
  // flash of the other theme.
  var current = getSaved() === "light" ? "light" : "dark";
  apply(current);

  function mountToggle() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Switch between dark and light mode");
    btn.id = "ac-theme-toggle";
    var dark =
      "position:fixed;bottom:20px;right:20px;z-index:2147483647;" +
      "width:44px;height:44px;border-radius:50%;border:1px solid var(--border);" +
      "background:var(--card-bg);color:var(--text);font-size:18px;line-height:1;" +
      "cursor:pointer;display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.35);font-family:'Archivo',sans-serif;";
    btn.setAttribute("style", dark);

    function render() {
      var isLight = document.documentElement.getAttribute("data-theme") === "light";
      btn.textContent = isLight ? "☀" : "☽"; // sun when light is on, moon when dark is on
      btn.title = isLight ? "Switch to dark mode" : "Switch to light mode";
    }

    btn.addEventListener("click", function () {
      var isLight = document.documentElement.getAttribute("data-theme") === "light";
      var next = isLight ? "dark" : "light";
      apply(next);
      save(next);
      render();
    });

    render();
    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle);
  } else {
    mountToggle();
  }
})();
