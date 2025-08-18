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

  function getBgState() {
    try {
      const ds = document.body?.dataset;
      if (ds?.bgSetting === 'white' || ds?.bgSetting === 'black' || ds?.bgSetting === 'none') return { type: ds.bgSetting };
      if (ds?.bgSetting === 'image' && ds?.bgImageSrc) return { type: 'image', src: ds.bgImageSrc };
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

  function letterboxColorFor(bg) {
    if (bg.type === 'black') return '#000000';
    if (bg.type === 'white') return '#ffffff';
    // 背景未設定でも透過ではなく白で塗る
    if (bg.type === 'none') return '#ffffff';
    return '#ffffff';
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
    scalePct = Math.max(50, Math.min(150, scalePct));
    return { scalePct, xPx, yPx };
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      try {
        const a = document.createElement('a');
        a.href = src; // resolve to absolute URL
        const url = a.href;
        const img = new Image();
        // Do not set crossOrigin to avoid CORS-taint on same-origin assets
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      } catch {
        resolve(null);
      }
    });
  }

  function sameOrigin(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin;
    } catch { return false; }
  }

  async function exportPNG() {
    const container = getContainer();
    if (!container) return alert('プレビュー領域が見つかりません');
    const w = Math.floor(container.clientWidth || container.getBoundingClientRect().width);
    const h = Math.floor(container.clientHeight || container.getBoundingClientRect().height);
    if (!w || !h) return alert('プレビューのサイズが0です');

    const bg = getBgState();
    const pat = getPatternState();
    const tf = getPatternTransform();

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return alert('Canvasコンテキスト取得に失敗しました');
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill background color (letterbox)
    const bgColor = letterboxColorFor(bg);
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    // Draw background image (height fit)
    if (bg.type === 'image' && bg.src) {
      const bgImg = await loadImage(bg.src);
      if (bgImg && bgImg.naturalWidth && bgImg.naturalHeight) {
        const ratio = bgImg.naturalWidth / bgImg.naturalHeight;
        const dh = h; const dw = dh * ratio;
        const dx = Math.round((w - dw) / 2);
        const dy = 0;
        ctx.drawImage(bgImg, 0, 0, bgImg.naturalWidth, bgImg.naturalHeight, dx, dy, dw, dh);
      }
    }

    // Draw pattern next (middle layer)
    if (pat.src) {
      const pImg = await loadImage(pat.src);
      if (pImg && pImg.naturalWidth && pImg.naturalHeight) {
        const ratio = pImg.naturalWidth / pImg.naturalHeight;
        const dh = Math.round(h * (tf.scalePct / 100));
        const dw = Math.round(dh * ratio);
        const dx = Math.round((w - dw) / 2 + tf.xPx);
        const dy = Math.round((h - dh) / 2 + tf.yPx);
        ctx.drawImage(pImg, 0, 0, pImg.naturalWidth, pImg.naturalHeight, dx, dy, dw, dh);
      }
    }

    // Draw user content canvases (if any) in DOM order, scaled to preview size
    try {
      const container = getContainer();
      const canvases = container ? Array.from(container.querySelectorAll('canvas')) : [];
      for (const cnv of canvases) {
        const cw = cnv.width || cnv.getBoundingClientRect().width;
        const ch = cnv.height || cnv.getBoundingClientRect().height;
        if (!cw || !ch) continue;
        // Draw stretched to fit preview area; assumes source canvas already has correct composition
        ctx.drawImage(cnv, 0, 0, w, h);
      }
    } catch {}

    // Draw CSS background-image elements (common for image-input previews)
    try {
      const cont = getContainer();
      if (cont) {
        const rectC = cont.getBoundingClientRect();
        const nodes = Array.from(cont.querySelectorAll('*')).filter(el => el !== cont);
        for (const el of nodes) {
          const cs = getComputedStyle(el);
          const bi = cs.backgroundImage;
          if (!bi || bi === 'none' || !/url\(/i.test(bi)) continue;
          const m = bi.match(/url\(["']?([^"')]+)["']?\)/i);
          if (!m) continue;
          const src = m[1];
          const im = await loadImage(src);
          if (!im || !im.naturalWidth || !im.naturalHeight) continue;
          const rect = el.getBoundingClientRect();
          const ew = rect.width, eh = rect.height;
          if (!ew || !eh) continue;
          const ratio = im.naturalWidth / im.naturalHeight;
          let dw = ew, dh = eh;
          // Background-size handling: contain/cover/auto X/auto Y (limited cases)
          const bs = cs.backgroundSize.trim();
          if (bs === 'contain') {
            const s = Math.min(ew / im.naturalWidth, eh / im.naturalHeight);
            dw = im.naturalWidth * s; dh = im.naturalHeight * s;
          } else if (bs === 'cover') {
            const s = Math.max(ew / im.naturalWidth, eh / im.naturalHeight);
            dw = im.naturalWidth * s; dh = im.naturalHeight * s;
          } else if (/^auto\s+\d+(px|%)$/.test(bs)) {
            const v = parseFloat(bs.split(/\s+/)[1]);
            if (/%$/.test(bs)) dh = eh * (v / 100); else dh = v;
            dw = dh * ratio;
          } else if (/^\d+(px|%)\s+auto$/.test(bs)) {
            const v = parseFloat(bs.split(/\s+/)[0]);
            if (/%/.test(bs)) dw = ew * (v / 100); else dw = v;
            dh = dw / ratio;
          } else if (/^auto\s+auto$/.test(bs) || bs === 'auto') {
            // default: contain by height (common in our UI)
            dh = eh; dw = dh * ratio;
          }
          // Background-position: handle center/default
          let dx = rect.left - rectC.left, dy = rect.top - rectC.top;
          const bp = cs.backgroundPosition.split(' ');
          const bx = bp[0] || '50%';
          const by = bp[1] || '50%';
          const parsePos = (val, total, draw) => {
            if (/^\d+%$/.test(val)) return (parseFloat(val) / 100) * (total - draw);
            if (/^\d+px$/.test(val)) return parseFloat(val);
            if (val === 'center') return (total - draw) / 2;
            if (val === 'left' || val === 'top') return 0;
            if (val === 'right' || val === 'bottom') return total - draw;
            return (total - draw) / 2;
          };
          dx += parsePos(bx, ew, dw);
          dy += parsePos(by, eh, dh);
          ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
        }
      }
    } catch {}

    // Draw all visible IMG elements inside container (except overlay), in DOM order
    try {
      const cont = getContainer();
      if (cont) {
        const rectC = cont.getBoundingClientRect();
        const imgs = Array.from(cont.querySelectorAll('img')).filter(el => el.id !== 'patternOverlay');
        for (const el of imgs) {
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          // Compute draw target coordinates relative to container
          const dx = Math.round(rect.left - rectC.left);
          const dy = Math.round(rect.top - rectC.top);
          const dw = Math.round(rect.width);
          const dh = Math.round(rect.height);
          try {
            ctx.drawImage(el, dx, dy, dw, dh);
          } catch {
            // Fallback: load by URL if possible
            const im = await loadImage(el.src);
            if (im && im.naturalWidth && im.naturalHeight) {
              ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, dx, dy, dw, dh);
            }
          }
        }
      }
    } catch {}

    // Pattern is already drawn before user content to keep it below image input

    // Trigger download
    try {
      const a = document.createElement('a');
      a.download = 'preview.png';
      a.href = canvas.toDataURL('image/png');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 0);
    } catch (err) {
      console.error(err);
      alert('PNGの書き出しに失敗しました。\n画像が別ドメインやfile://から読み込まれていると、ブラウザの制約で保存できません。\nGitHub Pagesやローカルサーバー（http://localhost）から同一ドメインで開いてください。');
    }
  }

  function attachToExistingButton() {
    // 既存のPNG保存ボタンに紐付け（作成しない）
    const candidates = [
      '#exportPngBtn', '#pngSaveBtn', '#savePng', '[data-action="export-png"]', '[data-role="export-png"]'
    ];
    let btn = null;
    for (const sel of candidates) { btn = document.querySelector(sel); if (btn) break; }
    if (!btn) {
      // テキストから推測
      const all = Array.from(document.querySelectorAll('button, [role="button"], a'));
      btn = all.find(b => /png|保存|download|export/i.test((b.textContent || '').trim()));
    }
    if (!btn) return;
    const handler = (e) => { try { e.preventDefault(); e.stopPropagation(); } catch {}; exportPNG(); };
    btn.addEventListener('click', handler, { capture: true });
  }

  function init(){ attachToExistingButton(); window.exportPreviewPNG = exportPNG; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
