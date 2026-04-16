// Vercel Web Analytics - Official CDN Script Loader
// This script dynamically loads the Vercel Analytics script from the CDN
// Only loads in production (not on localhost)
(function () {
  if (typeof window === 'undefined') return;
  
  // Initialize the analytics queue function
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Skip loading on localhost/development
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return;
  
  // Dynamically load the Vercel Analytics script from CDN
  var script = document.createElement('script');
  script.defer = true;
  script.src = 'https://cdn.vercel-insights.com/v1/script.js';
  document.head.appendChild(script);
})();
