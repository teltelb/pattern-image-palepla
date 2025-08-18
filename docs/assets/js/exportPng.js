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

    // Draw pattern (height fit with scale, offset px)
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
