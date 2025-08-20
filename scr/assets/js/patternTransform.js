(function(){
  function getContainer() {
    try {
      const sel = document.body?.getAttribute('data-preview-selector');
      if (sel) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
    } catch {}
    let el = document.querySelector('#preview');
    if (el) {
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'canvas' && el.parentElement) return el.parentElement;
      return el;
    }
    el = document.querySelector('#previewArea, .preview-area');
    if (el) return el;
    const img = document.querySelector('#previewImage, .preview img');
    if (img && img.parentElement) return img.parentElement;
    const canvas = document.querySelector('#mainCanvas, canvas');
    if (canvas && canvas.parentElement) return canvas.parentElement;
    return document.body;
  }

  function applyFixed() {
    // Keep overlay transforms set by patternSettings.js; no-op here.
    const container = getContainer();
    if (!container) return;
    const ov = container.querySelector('#patternOverlay');
    if (!ov) return;
    // Ensure overlay remains on top
    try { ov.style.zIndex = '1000'; } catch {}
  }

  function removeControls() {
    const oldPanel = document.getElementById('patternControlPanel');
    if (oldPanel && oldPanel.parentNode) oldPanel.parentNode.removeChild(oldPanel);
    const oldReset = document.getElementById('resetPatternTransformBtn');
    if (oldReset && oldReset.parentNode) oldReset.parentNode.removeChild(oldReset);
  }

  function init(){
    removeControls();
    applyFixed();
    window.addEventListener('resize', applyFixed);
    window.addEventListener('patternOverlayLoaded', applyFixed);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
