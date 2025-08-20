// Non-module script: adds a "背景設定" button near preview white/black buttons
// and opens a small window to choose white or black background, then applies it.

(function(){
  function getPreviewElement() {
    // Custom selector via data-attribute on body (if provided)
    try {
      const sel = document.body?.getAttribute('data-preview-selector');
      if (sel) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
    } catch {}
    // Prefer the actual preview canvas so background attaches to its back
    let el = document.querySelector('#preview');
    if (el) return el;
    // Fallbacks: container or others
    el = document.querySelector('#previewArea, .preview-area, [data-role="preview"]');
    if (el) return el;
    // If a dedicated preview <img> exists
    el = document.querySelector('#previewImage, .preview img');
    if (el) return el;
    // Prefer a container around the first canvas
    const canvas = document.querySelector('#mainCanvas, canvas');
    if (canvas) return canvas.parentElement || canvas;
    return null;
  }
  function findButtons() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a'));
    let whiteBtn = null, blackBtn = null;
    for (const el of buttons) {
      const label = ((el.textContent || el.value || '').trim());
      if (!label) continue;
      if (!whiteBtn && (label.includes('白背景') || label.includes('White'))) whiteBtn = el;
      if (!blackBtn && (label.includes('黒背景') || label.includes('Black'))) blackBtn = el;
      if (whiteBtn && blackBtn) break;
    }
    return { whiteBtn, blackBtn };
  }

  function hideOriginalBgButtons() {
    const { whiteBtn, blackBtn } = findButtons();
    [whiteBtn, blackBtn].forEach(el => {
      if (!el) return;
      try { el.style.display = 'none'; } catch {}
      try { el.setAttribute('aria-hidden', 'true'); el.tabIndex = -1; } catch {}
    });
  }

  function rememberBackground(value, imgSrc) {
    try {
      document.body.dataset.bgSetting = value;
      if (imgSrc) document.body.dataset.bgImageSrc = imgSrc; else delete document.body.dataset.bgImageSrc;
    } catch {}
    try {
      localStorage.setItem('bgSetting', value);
      if (imgSrc) localStorage.setItem('bgImageSrc', imgSrc);
      else localStorage.removeItem('bgImageSrc');
    } catch {}
  }

  function detectFromButtons(whiteBtn, blackBtn) {
    const isOn = (el) => {
      if (!el) return false;
      const aria = (el.getAttribute && el.getAttribute('aria-pressed')) || '';
      if (String(aria).toLowerCase() === 'true') return true;
      const cls = (el.className || '').toLowerCase();
      if (cls.includes('active') || cls.includes('selected') || cls.includes('current')) return true;
      return false;
    };
    if (isOn(whiteBtn)) return 'white';
    if (isOn(blackBtn)) return 'black';
    return null;
  }

  function detectFromComputedStyle() {
    try {
      const preview = getPreviewElement() || document.querySelector('canvas');
      if (!preview) return null;
      const cs = getComputedStyle(preview);
      const c = cs.backgroundColor || '';
      const m = c.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d\.]+))?\)/i);
      if (!m) return null;
      const r = parseInt(m[1],10), g = parseInt(m[2],10), b = parseInt(m[3],10);
      const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (a === 0) return null; // fully transparent, unknown
      const distWhite = Math.hypot(255 - r, 255 - g, 255 - b);
      const distBlack = Math.hypot(r, g, b);
      return distWhite <= distBlack ? 'white' : 'black';
    } catch { return null; }
  }

  function getCurrentBackground() {
    try {
      const ds = document.body?.dataset?.bgSetting;
      if (ds === 'white' || ds === 'black') return ds;
      if (ds === 'image') return { type: 'image', src: document.body?.dataset?.bgImageSrc };
    } catch {}
    try {
      const ls = localStorage.getItem('bgSetting');
      if (ls === 'white' || ls === 'black') return ls;
      if (ls === 'image') {
        const src = localStorage.getItem('bgImageSrc') || null;
        return { type: 'image', src };
      }
    } catch {}
    // Detect image from computed styles first
    const img = detectImageFromComputedStyle();
    if (img) return { type: 'image', src: img };
    const { whiteBtn, blackBtn } = findButtons();
    const byBtn = detectFromButtons(whiteBtn, blackBtn);
    if (byBtn) return byBtn;
    return detectFromComputedStyle();
  }

  function getLetterboxColor() {
    try {
      const ds = document.body?.dataset?.bgSetting;
      if (ds === 'black') return '#000000';
      if (ds === 'white') return '#ffffff';
    } catch {}
    try {
      const ls = localStorage.getItem('bgSetting');
      if (ls === 'black') return '#000000';
      if (ls === 'white') return '#ffffff';
    } catch {}
    const guess = detectFromComputedStyle();
    if (guess === 'black') return '#000000';
    return '#ffffff';
  }

  function detectImageFromComputedStyle() {
    try {
      const preview = getPreviewElement() || document.querySelector('canvas');
      if (!preview) return null;
      const cs = getComputedStyle(preview);
      const bi = cs.backgroundImage || '';
      if (!bi || bi === 'none') return null;
      const m = bi.match(/url\(["']?([^"')]+)["']?\)/i);
      return m ? m[1] : null;
    } catch { return null; }
  }

  function insertButtonNear(refEl) {
    if (!refEl) return null;
    if (document.getElementById('openBgSettingBtn')) return document.getElementById('openBgSettingBtn');
    const btn = document.createElement('button');
    btn.id = 'openBgSettingBtn';
    btn.type = 'button';
    btn.textContent = '背景設定';
    try { if (refEl.className) btn.className = refEl.className; } catch {}
    btn.style.marginLeft = '8px';
    if (refEl.parentNode) {
      if (refEl.nextSibling) refEl.parentNode.insertBefore(btn, refEl.nextSibling);
      else refEl.parentNode.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
    return btn;
  }

  function applyBackground(value, imgSrc) {
    // Preferred: set preview/canvas background style directly
    const preview = getPreviewElement();
    if (preview) {
      const isImg = preview.tagName && preview.tagName.toLowerCase() === 'img';
      const px = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // 1x1 transparent

      // current pattern (top layer if exists)
      let patternSrc = null;
      try { patternSrc = document.body?.dataset?.patternImageSrc || localStorage.getItem('patternImageSrc') || null; } catch {}

      const setLayers = (bgColor, bgImageSrc) => {
        const layers = [];
        const repeats = [];
        const positions = [];
        const sizes = [];
        // Read pattern transform
        let scale = 1, offX = 0, offY = 0;
        try {
          const ds = document.body?.dataset;
          if (ds?.patternScale) scale = parseFloat(ds.patternScale) || 1;
          if (ds?.patternOffsetX) offX = parseFloat(ds.patternOffsetX) || 0;
          if (ds?.patternOffsetY) offY = parseFloat(ds.patternOffsetY) || 0;
        } catch {}
        try {
          if (!isFinite(scale)) scale = parseFloat(localStorage.getItem('patternScale')) || scale;
          if (!isFinite(offX)) offX = parseFloat(localStorage.getItem('patternOffsetX')) || offX;
          if (!isFinite(offY)) offY = parseFloat(localStorage.getItem('patternOffsetY')) || offY;
        } catch {}

        // Base background image (no pattern here)
        if (bgImageSrc) {
          layers.push(`url('${bgImageSrc}')`);
          repeats.push('no-repeat');
          positions.push('center');
          sizes.push('auto 100%');
        }
        preview.style.backgroundImage = layers.join(', ');
        preview.style.backgroundRepeat = repeats.join(', ');
        preview.style.backgroundPosition = positions.join(', ');
        preview.style.backgroundSize = sizes.join(', ');
        preview.style.backgroundColor = bgColor;

        // Save as base so patternSettings can stack pattern above it
        try {
          preview.dataset.bgBaseImage = preview.style.backgroundImage || '';
          preview.dataset.bgBaseRepeat = preview.style.backgroundRepeat || '';
          preview.dataset.bgBasePosition = preview.style.backgroundPosition || '';
          preview.dataset.bgBaseSize = preview.style.backgroundSize || '';
          preview.dataset.bgBaseColor = bgColor || '';
        } catch {}
      };

      if (value === 'none') {
        // Keep pattern layer only; clear background image and color to transparent
        if (isImg) {
          preview.src = px;
          preview.style.objectFit = '';
          preview.style.width = 'auto';
          preview.style.height = '100%';
        }
        // transparent base; no image
        preview.style.backgroundImage = '';
        preview.style.backgroundRepeat = '';
        preview.style.backgroundPosition = '';
        preview.style.backgroundSize = '';
        preview.style.backgroundColor = 'transparent';
        rememberBackground('none');
        try { window.postMessage({ type: 'patternParamsChanged' }, '*'); } catch {}
      } else if (value === 'white' || value === 'black') {
        if (isImg) {
          preview.src = px;
          preview.style.objectFit = '';
          preview.style.width = 'auto';
          preview.style.height = '100%';
        }
        setLayers(value === 'white' ? '#ffffff' : '#000000', null);
        rememberBackground(value);
        try { window.postMessage({ type: 'patternParamsChanged' }, '*'); } catch {}
      } else if (value === 'image' && imgSrc) {
        const letterbox = getLetterboxColor();
        if (isImg) {
          preview.src = px; // keep composite on background layers
          preview.style.objectFit = '';
          preview.style.width = 'auto';
          preview.style.height = '100%';
        }
        setLayers(letterbox, imgSrc);
        rememberBackground('image', imgSrc);
        try { window.postMessage({ type: 'patternParamsChanged' }, '*'); } catch {}
      }
      return true;
    }
    // Fallback: if preview not found, try existing buttons if present
    const { whiteBtn, blackBtn } = findButtons();
    if (value === 'white' && whiteBtn) { rememberBackground('white'); whiteBtn.click?.(); try { window.postMessage({ type: 'patternParamsChanged' }, '*'); } catch {} return true; }
    if (value === 'black' && blackBtn) { rememberBackground('black'); blackBtn.click?.(); try { window.postMessage({ type: 'patternParamsChanged' }, '*'); } catch {} return true; }
    return false;
  }

  function openSelector() {
    const cur = getCurrentBackground();
    let url = 'bgSelector.html';
    if (cur) {
      if (typeof cur === 'string') {
        url += `?bg=${encodeURIComponent(cur)}`;
      } else if (cur && cur.type === 'image' && cur.src) {
        url += `?img=${encodeURIComponent(cur.src)}`;
      }
    }
    window.open(url, 'bgSettingWin', 'width=560,height=420');
  }

  function init() {
    const { whiteBtn, blackBtn } = findButtons();
    const anchor = blackBtn || whiteBtn;
    const settingBtn = insertButtonNear(anchor);
    if (settingBtn) settingBtn.addEventListener('click', openSelector);

    // Track manual toggles to remember current state
    if (whiteBtn) whiteBtn.addEventListener('click', () => rememberBackground('white'), true);
    if (blackBtn) blackBtn.addEventListener('click', () => rememberBackground('black'), true);

    // Remove original white/black buttons per request
    hideOriginalBgButtons();

    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (!d || d.type !== 'bgSettingApply') return;
      if (d.value === 'image' && d.src) applyBackground('image', d.src);
      else applyBackground(d.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
