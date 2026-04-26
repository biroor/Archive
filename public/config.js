// Configuration - Detect environment and set API URL accordingly

console.log('[Config] Starting initialization...');
console.log('[Config] Full URL:', window.location.href);
console.log('[Config] Hostname:', window.location.hostname);
console.log('[Config] Protocol:', window.location.protocol);

let API_BASE_URL = '/archive/api.php'; // Default to production path

// Detect current environment and set API URL immediately
const host = window.location.hostname;
const protocol = window.location.protocol;

// Debug: show exact hostname
console.log('[Config] Checking host:', host);
console.log('[Config] host.includes("biroorweb"):', host.includes('biroorweb'));
console.log('[Config] host.includes("biroor"):', host.includes('biroor'));

// If running on localhost (development)
if (host === 'localhost' || host === '127.0.0.1') {
  API_BASE_URL = 'http://localhost:3000/api.php';
  console.log('[Config] ✓ Development mode detected');
} 
// If running on biroorweb.uk or biroor domain (production)
else if (host.includes('biroorweb') || host.includes('biroor')) {
  API_BASE_URL = '/archive/api.php';
  console.log('[Config] ✓ Production mode detected');
} else {
  console.warn('[Config] ⚠ Unknown domain:', host, '- using production default');
}

// Set to global scope
window.API_BASE = API_BASE_URL;
console.log('[Config] ✓✓✓ API_BASE set to:', window.API_BASE);

// Verify it was actually set
if (!window.API_BASE || window.API_BASE === 'undefined') {
  console.error('[Config] ERROR: API_BASE failed to set properly!');
  window.API_BASE = '/archive/api.php'; // Emergency fallback
  console.warn('[Config] Using emergency fallback: /archive/api.php');
}
