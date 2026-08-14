(function () {
  "use strict";
  const parameters = new URLSearchParams(window.location.search);
  const provider = parameters.get("provider") || "provider";
  const status = parameters.get("status") || "connected";
  document.getElementById("auth-complete-title").textContent = `${provider.toUpperCase()} ${status}`;
  document.getElementById("auth-complete-message").textContent = "Authorization is stored only by your local Draft Room server. Return to the app and refresh leagues.";
  document.getElementById("auth-complete-close").addEventListener("click", () => window.close());
  if (window.opener && window.opener.location.origin === window.location.origin) window.opener.postMessage({ type: "draft-room-connector", provider, status }, window.location.origin);
})();
