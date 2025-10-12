// Simple runtime API base URL config
// Localhost uses same-origin; production uses API subdomain or render URL
(function(){
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  // TODO: set to your backend domain. If you mapped www to backend, leave empty.
  // Example: 'https://api.5v5games.com' or 'https://fivev5-football-platform.onrender.com'
  window.API_BASE_URL = isLocal ? '' : 'https://fivev5-football-platform.onrender.com';
})();