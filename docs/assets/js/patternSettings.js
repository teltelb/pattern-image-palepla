// Pattern settings: insert button, open selector, and render pattern as GPU-accelerated overlay

(function(){
  const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // 1x1 transparent

  function getPreviewContainer() {
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

  function getBgState() {
    try {
      const ds = document.body?.dataset;
      if (ds?.bgSetting === 'white' || ds?.bgSetting === 'black') return { type: ds.bgSetting };
      if (ds?.bgSetting === 'image' && ds?.bgImageSrc) return { type: 'image', src: ds.bgImageSrc };
      if (ds?.bgSetting === 'none') return { type: 'none' };
    } catch {}
    try {
      const s = localStorage.getItem('bgSetting');
      if (s === 'white' || s === 'black' || s === 'none') return { type: s };
      if (s === 'image') {
        const src = localStorage.getItem('bgImageSrc');
        if (src) return { type: 'image', src };
      }
    } catch {}
    return { type: 'white' };
  }

  function getPatternState() {
    try {
      const ds = document.body?.dataset?.patternImageSrc;
      if (ds) return { src: ds };
    } catch {}
    try {
      const src = localStorage.getItem('patternImageSrc');
      if (src) return { src };
    } catch {}
    return { src: null };
  }

  function getPatternTransform() {
    // scalePct: 50-150, offsets X/Y in pixels (clamped loosely)
    let scalePct = 100, xPx = 0, yPx = 0;
    try {
      const ds = document.body?.dataset;
      if (ds?.patternScalePct) scalePct = parseFloat(ds.patternScalePct) || scalePct;
      if (ds?.patternOffsetX) xPx = parseFloat(ds.patternOffsetX) || xPx;
      if (ds?.patternOffsetY) yPx = parseFloat(ds.patternOffsetY) || yPx;
    } catch {}
    try {
      const s = localStorage.getItem('patternScalePct');
      const sx = localStorage.getItem('patternOffsetX');
      const sy = localStorage.getItem('patternOffsetY');
      if (s !== null) scalePct = parseFloat(s) || scalePct;
      if (sx !== null) xPx = parseFloat(sx) || xPx;
      if (sy !== null) yPx = parseFloat(sy) || yPx;
    } catch {}
    // clamp scale; offsets will be clamped visually by background calc; set soft clamp here
    scalePct = Math.max(50, Math.min(150, scalePct));
    return { scalePct, xPx, yPx };
  }

  function rememberPattern(src) {
    try { if (src) document.body.dataset.patternImageSrc = src; else delete document.body.dataset.patternImageSrc; } catch {}
    try { if (src) localStorage.setItem('patternImageSrc', src); else localStorage.removeItem('patternImageSrc'); } catch {}
  }

  function letterboxColorFor(bg) {
    if (bg.type === 'black') return '#000000';
    if (bg.type === 'white') return '#ffffff';
    try {
      const s = localStorage.getItem('bgSetting');
      if (s === 'black') return '#000000';
    } catch {}
    return 'transparent';
  }

  function ensureOverlay(container) {
    let ov = container.querySelector('#patternOverlay');
    if (!ov) {
      ov = document.createElement('img');
      ov.id = 'patternOverlay';
      ov.alt = '';
      ov.style.position = 'absolute';
      ov.style.top = '0';
      ov.style.left = '0';
      ov.style.height = '100%';
      ov.style.width = '100%';
      ov.style.objectFit = 'contain';
      ov.style.transformOrigin = '50% 50%';
      ov.style.transform = 'none';
      ov.style.pointerEvents = 'none';
      ov.style.zIndex = '1000';
      try { container.style.willChange = 'background-position, background-size'; } catch {}
      const cs = getComputedStyle(container);
      if (cs.position === 'static') container.style.position = 'relative';
      if (container.style.overflow === '') container.style.overflow = 'hidden';
      container.appendChild(ov);
    }
    return ov;
  }

  function applyOverlayTransform(container, ov) {
    // Fixed display: no manual transform, always contain
    ov.style.transform = 'none';
  }

  function applyComposite(patternSrc) {
    const container = getPreviewContainer();
    const bg = getBgState();

    // Compose pattern (top) and background (bottom) as container backgrounds
    const layers = [];
    const repeats = [];
    const positions = [];
    const sizes = [];
    const sColor = letterboxColorFor(bg);

    if (patternSrc) {
      const tf = getPatternTransform();
      layers.push(`url('${patternSrc}')`);
      repeats.push('no-repeat');
      positions.push(`calc(50% + ${tf.xPx}px) calc(50% + ${tf.yPx}px)`);
      sizes.push(`auto ${tf.scalePct}%`);
    }
    if (bg.type === 'image' && bg.src) {
      layers.push(`url('${bg.src}')`);
      repeats.push('no-repeat');
      positions.push('center');
      sizes.push('auto 100%');
    }

    const sImage = layers.join(', ');
    const sRepeat = repeats.join(', ');
    const sPos = positions.join(', ');
    const sSize = sizes.join(', ');
    const sig = sImage + '|' + sRepeat + '|' + sPos + '|' + sSize + '|' + sColor;
    if (container.dataset.bgSig !== sig) {
      container.dataset.bgSig = sig;
      container.style.backgroundImage = sImage;
      container.style.backgroundRepeat = sRepeat;
      container.style.backgroundPosition = sPos;
      container.style.backgroundSize = sSize;
      container.style.backgroundColor = sColor;
    }

    // Ensure overlay is hidden (we use background layers to guarantee stacking)
    const ov = ensureOverlay(container);
    ov.style.display = 'none';

    // If a preview <img> exists, hide its content so it won't cover overlay
    const baseImg = container.querySelector('#previewImage, img:not(#patternOverlay)');
    if (baseImg) {
      baseImg.src = PX;
      baseImg.style.height = '100%';
      baseImg.style.width = 'auto';
      baseImg.style.objectFit = '';
    }
  }

  function insertPatternButton() {
    if (document.getElementById('openPatternSettingBtn')) return;
    let anchor = document.getElementById('openBgSettingBtn');
    if (!anchor) {
      const btns = Array.from(document.querySelectorAll('button, [role="button"], a'));
      anchor = btns.find(b => (b.textContent || '').includes('背景設定')) || btns[0];
    }
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.id = 'openPatternSettingBtn';
    btn.type = 'button';
    btn.textContent = 'パターン設定';
    try { if (anchor.className) btn.className = anchor.className; } catch {}
    btn.style.marginLeft = '8px';
    if (anchor.parentNode) {
      if (anchor.nextSibling) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
      else anchor.parentNode.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
    btn.addEventListener('click', () => {
      const cur = getPatternState();
      const url = cur.src ? `patternSelector.html?img=${encodeURIComponent(cur.src)}` : 'patternSelector.html';
      window.open(url, 'patternSettingWin', 'width=760,height=560');
    });
  }

  function init() {
    insertPatternButton();
    const ps = getPatternState();
    applyComposite(ps.src);
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (!d || d.type !== 'patternSettingApply') return;
      rememberPattern(d.src || null);
      applyComposite(d.src || null);
    });
    window.addEventListener('message', (e) => {
      const d = e && e.data;
      if (!d || d.type !== 'patternParamsChanged') return;
      const ps = getPatternState();
      applyComposite(ps.src);
    });
    // Lazy-load controls UI script if present on disk
    try {
      if (!window.__patternControlsInjected) {
        const sc = document.createElement('script');
        sc.src = 'assets/js/patternControls.js';
        sc.defer = true;
        document.body.appendChild(sc);
        window.__patternControlsInjected = true;
      }
      if (!window.__exportPngInjected) {
        const se = document.createElement('script');
        se.src = 'assets/js/exportPng.js';
        se.defer = true;
        document.body.appendChild(se);
        window.__exportPngInjected = true;
      }
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
