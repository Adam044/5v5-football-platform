// Simple runtime API base URL config
// Localhost uses same-origin; production uses API subdomain or render URL
(function(){
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  // TODO: set to your backend domain. If you mapped www to backend, leave empty.
  // Example: 'https://api.5v5games.com' or your Render service domain
  // NOTE: Service name in render.yaml is '5v5-football-platform' (with digits)
  window.API_BASE_URL = isLocal ? '' : 'https://5v5-football-platform.onrender.com';
})();