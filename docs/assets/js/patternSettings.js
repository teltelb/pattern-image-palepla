// Pattern settings: insert button, open selector, and render pattern as GPU-accelerated overlay

(function(){
  const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // 1x1 transparent

  function getPreviewRefs() {
    // Returns { target, container }
    let target = document.getElementById('preview');
    if (!target) target = document.querySelector('canvas#preview, #mainCanvas, canvas');
    let container = null;
    if (target && target.parentElement) container = target.parentElement;
    if (!container) {
      container = document.querySelector('#previewArea, .preview-area') || document.body;
    }
    return { target, container };
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
    // scalePct: min 100, offsets X/Y in pixels
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
    // clamp scale; offsets are unclamped here
    scalePct = Math.max(100, Math.min(150, scalePct));
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
    let wrap = container.querySelector('#patternOverlayWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'patternOverlayWrap';
      wrap.style.position = 'absolute';
      wrap.style.top = '0';
      wrap.style.left = '0';
      wrap.style.width = '0px';
      wrap.style.height = '0px';
      wrap.style.overflow = 'hidden';
      wrap.style.zIndex = '1';
      const cs = getComputedStyle(container);
      if (cs.position === 'static') container.style.position = 'relative';
      container.appendChild(wrap);
    }
    let pan = wrap.querySelector('#patternOverlayPan');
    if (!pan) {
      pan = document.createElement('div');
      pan.id = 'patternOverlayPan';
      pan.style.position = 'absolute';
      pan.style.left = '0';
      pan.style.top = '0';
      pan.style.width = '100%';
      pan.style.height = '100%';
      pan.style.transform = 'translate(0px, 0px)';
      pan.style.willChange = 'transform';
      pan.style.pointerEvents = 'none';
      wrap.appendChild(pan);
    }
    let ov = pan.querySelector('#patternOverlay');
    if (!ov) {
      ov = document.createElement('img');
      ov.id = 'patternOverlay';
      ov.alt = '';
      ov.style.position = 'absolute';
      ov.style.left = '50%';
      ov.style.top = '50%';
      // Fit height to preview, keep aspect (width auto)
      ov.style.height = '100%';
      ov.style.width = 'auto';
      ov.style.maxWidth = 'none';
      ov.style.objectFit = 'unset';
      ov.style.transformOrigin = '50% 50%';
      // center the image on its own center, then scale from center
      ov.style.transform = 'translate(-50%, -50%) scale(1)';
      ov.style.willChange = 'transform';
      ov.style.pointerEvents = 'none';
      pan.appendChild(ov);
    }
    return { wrap, pan, ov };
  }

  function layoutOverlay(target, container, wrap) {
    try {
      const pr = container.getBoundingClientRect();
      const cr = target.getBoundingClientRect();
      const left = Math.round(cr.left - pr.left);
      const top = Math.round(cr.top - pr.top);
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      wrap.style.left = left + 'px';
      wrap.style.top = top + 'px';
      wrap.style.width = w + 'px';
      wrap.style.height = h + 'px';
    } catch {}
  }

  function applyOverlayTransform(container, pan, ov) {
    // 画像は自然サイズ（拡縮率で拡大のみ）。プレビュー中心基準で配置。
    const tf = getPatternTransform();
    const s = Math.max(1, (tf.scalePct || 100) / 100);
    const x = tf.xPx || 0;
    const y = tf.yPx || 0;
    // pan moves the viewport center in screen px
    pan.style.transform = `translate(${x}px, ${y}px)`;
    // ov centers itself on pan's (0,0) and scales from center
    ov.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  function applyComposite(patternSrc) {
    const { target, container } = getPreviewRefs();
    // Pattern is rendered as an overlay image above the preview.
    const { wrap, pan, ov } = ensureOverlay(container);
    // If an overlay was mistakenly appended under the canvas in older runs, remove it
    try { const wrong = (target && target.querySelector) ? target.querySelector('#patternOverlay') : null; if (wrong && wrong !== ov) wrong.remove(); } catch {}
    // Always align wrap to the preview target size
    layoutOverlay(target, container, wrap);
    if (patternSrc) {
      if (ov.dataset.src !== patternSrc) {
        ov.style.display = 'none';
        ov.onload = () => {
          try {
            ov.style.width = 'auto';
            ov.style.height = '100%';
            ov.style.maxWidth = 'none';
            if (ov.naturalWidth && ov.naturalHeight) {
              ov.style.aspectRatio = `${ov.naturalWidth} / ${ov.naturalHeight}`;
            }
          } catch {}
          ov.style.display = '';
          layoutOverlay(target, container, wrap);
          applyOverlayTransform(container, pan, ov);
        };
        ov.src = patternSrc;
        ov.dataset.src = patternSrc;
      }
      // Remove any stray overlays outside our managed wrap to avoid duplicates
      try {
        document.querySelectorAll('#patternOverlay').forEach((el) => {
          if (el !== ov && el.ownerDocument === document) {
            try { el.remove(); } catch {}
          }
        });
      } catch {}
      ov.style.display = '';
      layoutOverlay(target, container, wrap);
      applyOverlayTransform(container, pan, ov);
    } else {
      ov.style.display = 'none';
      ov.removeAttribute('src');
      delete ov.dataset.src;
    }
    // Do not touch container background here. bgSettings.js manages background state.
    // Keep overlay aligned on resize
    if (!container.__overlayResizeBound) {
      container.__overlayResizeBound = true;
      const realign = () => { try { const { target } = getPreviewRefs(); layoutOverlay(target, container, wrap); applyOverlayTransform(container, pan, ov); } catch {} };
      window.addEventListener('resize', realign);
      try {
        const t = document.getElementById('preview');
        if (t && 'ResizeObserver' in window) {
          const ro = new ResizeObserver(realign);
          ro.observe(t);
          container.__overlayRO = ro;
        }
      } catch {}
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
