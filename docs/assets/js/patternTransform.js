(function(){
  function getContainer() {
    try {
      const sel = document.body?.getAttribute('data-preview-selector');
      if (sel) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
    } catch {}
    let el = document.querySelector('#preview, #previewArea, .preview, [data-role="preview"]');
    if (el) return el;
    const img = document.querySelector('#previewImage, .preview img');
    if (img && img.parentElement) return img.parentElement;
    const canvas = document.querySelector('#mainCanvas, canvas');
    if (canvas && canvas.parentElement) return canvas.parentElement;
    return document.body;
  }

  function applyFixed() {
    const container = getContainer();
    if (!container) return;
    const ov = container.querySelector('#patternOverlay');
    if (!ov || ov.style.display === 'none') return;
    ov.style.transform = 'none';
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

