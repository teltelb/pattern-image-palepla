// Do not override the high-quality export in app.js.
// If app.js defined exportPng, alias it to exportPNG and exit.
(function(){
  if (typeof window !== 'undefined' && typeof window.exportPng === 'function') {
    window.exportPNG = window.exportPng;
    return;
  }
  // Fallback (should not normally happen): no override, keep button inert or rely on app.
})();
