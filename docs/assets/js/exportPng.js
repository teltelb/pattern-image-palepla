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

  function parseHashExport(){
    try {
      const m = (location.hash||'').match(/export=([0-9]+)x([0-9]+)@([0-9]+)/i);
      if (!m) return null;
      return { width: parseFloat(m[1]), height: parseFloat(m[2]), dpi: parseFloat(m[3]) };
    } catch { return null; }
  }

  function getExportSettings(containerW, containerH, overrides){
    const ds = document.body?.dataset || {};
    // Try reading from common inputs if present (app既存の指定を優先)
    const readNum = (selArr)=>{
      for(const sel of selArr){ const el = document.querySelector(sel); if(el && el.value) return parseFloat(el.value); }
      return null;
    };
    // DPI
    let dpi = overrides?.dpi || readNum(['#exportDpi','[name="exportDpi"]','#dpi','#pngDpi','#printDpi','#outputDpi']);
    if (!dpi && ds.exportDpi) dpi = parseFloat(ds.exportDpi);
    const hash = parseHashExport();
    // Width/Height: support app inputs (#width/#height) and fallbacks
    let w = overrides?.width || (hash?.width) || readNum(['#width','#exportWidth','[name="exportWidth"]','#outW','#pngWidth','#outputWidth']);
    let h = overrides?.height || (hash?.height) || readNum(['#height','#exportHeight','[name="exportHeight"]','#outH','#pngHeight','#outputHeight']);
    // Unit handling for app inputs
    const unitEl = document.querySelector('#unit');
    const unitVal = unitEl && unitEl.value ? String(unitEl.value).toLowerCase() : null;
    // If app specifies mm, convert to px using DPI
    if ((unitVal === 'mm') && (w || h)) {
      const useDpiForMm = dpi || 300;
      const mmToPx = (mm)=> Math.round((parseFloat(mm)||0) / 25.4 * useDpiForMm);
      if (w) w = mmToPx(w);
      if (h) h = mmToPx(h);
    }
    // Dataset fallback
    // px direct
    if (!w && ds.exportWidth) w = parseFloat(ds.exportWidth);
    if (!h && ds.exportHeight) h = parseFloat(ds.exportHeight);
    // mm → px
    const mmW = ds.exportWidthMm ? parseFloat(ds.exportWidthMm) : null;
    const mmH = ds.exportHeightMm ? parseFloat(ds.exportHeightMm) : null;
    const inW = ds.exportWidthIn ? parseFloat(ds.exportWidthIn) : null;
    const inH = ds.exportHeightIn ? parseFloat(ds.exportHeightIn) : null;
    const useDpi = dpi || 300; // default when converting from physical units
    if (!w && (mmW || inW)) {
      const inches = inW || (mmW / 25.4);
      w = Math.round(inches * useDpi);
    }
    if (!h && (mmH || inH)) {
      const inches = inH || (mmH / 25.4);
      h = Math.round(inches * useDpi);
    }
    // Preserve aspect if only one provided
    if (w && !h) h = Math.round(containerH * (w / containerW));
    if (h && !w) w = Math.round(containerW * (h / containerH));
    return { targetW: w || containerW, targetH: h || containerH, dpi: dpi || null };
  }

  function toDataURLWithDPI(canvas, mime, dpi){
    const dataURL = canvas.toDataURL(mime || 'image/png');
    if (!dpi || !/^data:image\/png;base64,/.test(dataURL)) return dataURL;
    try {
      const b64 = dataURL.split(',')[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      // PNG signature
      const sig = [137,80,78,71,13,10,26,10];
      for (let i=0;i<8;i++) if (bytes[i]!==sig[i]) return dataURL;
      const u32 = (p)=> (bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3];
      const writeU32 = (arr, off, val)=>{ arr[off]=(val>>>24)&255; arr[off+1]=(val>>>16)&255; arr[off+2]=(val>>>8)&255; arr[off+3]=val&255; };
      let pos = 8;
      let ihdrEnd = -1, firstIDAT = -1, pHYsPos = -1, pHYsLen = 0;
      while (pos < bytes.length) {
        const len = u32(pos);
        const type = String.fromCharCode(bytes[pos+4],bytes[pos+5],bytes[pos+6],bytes[pos+7]);
        if (type==='IHDR') ihdrEnd = pos + 8 + len + 4;
        if (type==='IDAT' && firstIDAT<0) firstIDAT = pos;
        if (type==='pHYs') { pHYsPos = pos; pHYsLen = len; }
        pos += 8 + len + 4;
      }
      const ppm = Math.round(dpi * 39.37007874);
      const pHYsData = new Uint8Array(9);
      writeU32(pHYsData,0,ppm); writeU32(pHYsData,4,ppm); pHYsData[8]=1;
      const typeArr = new Uint8Array([112,72,89,115]); // 'pHYs'
      const makeCRC = (payload)=>{
        const tbl = (function(){ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c; } return t; })();
        let c = ~0; for (let i=0;i<payload.length;i++) c = tbl[(c^payload[i])&255] ^ (c>>>8); return (~c)>>>0;
      };
      const lenArr = new Uint8Array(4); writeU32(lenArr,0,9);
      const crcPayload = new Uint8Array(4 + 9); crcPayload.set(typeArr,0); crcPayload.set(pHYsData,4);
      const crcVal = makeCRC(crcPayload);
      const crcArr = new Uint8Array(4); writeU32(crcArr,0,crcVal);

      let out;
      if (pHYsPos >= 0 && pHYsLen === 9) {
        // Replace existing pHYs data and CRC
        const outBytes = bytes.slice();
        outBytes.set(pHYsData, pHYsPos + 8);
        outBytes.set(crcArr, pHYsPos + 8 + 9);
        out = outBytes;
      } else {
        // Insert before first IDAT, or after IHDR if no IDAT found (unlikely)
        const insertAt = (firstIDAT>=0 ? firstIDAT : ihdrEnd);
        const before = bytes.slice(0, insertAt);
        const after = bytes.slice(insertAt);
        out = new Uint8Array(before.length + 4 + 4 + 9 + 4 + after.length);
        let o=0; out.set(before,o); o+=before.length;
        out.set(lenArr,o); o+=4; out.set(typeArr,o); o+=4; out.set(pHYsData,o); o+=9; out.set(crcArr,o); o+=4;
        out.set(after,o);
      }
      let s=''; for (let i=0;i<out.length;i++) s+=String.fromCharCode(out[i]);
      return 'data:image/png;base64,' + btoa(s);
    } catch (e){
      console.warn('pHYs inject failed', e);
      return dataURL;
    }
  }

  function isVisible(el){
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function parseBgUrl(str){
    if (!str || str === 'none') return null;
    const m = str.match(/url\(["']?([^"')]+)["']?\)/i);
    return m ? m[1] : null;
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

  async function exportPNG(overrides) {
    const container = getContainer();
    if (!container) return alert('プレビュー領域が見つかりません');
    const w = Math.floor(container.clientWidth || container.getBoundingClientRect().width);
    const h = Math.floor(container.clientHeight || container.getBoundingClientRect().height);
    if (!w || !h) return alert('プレビューのサイズが0です');

    const bg = getBgState();
    const pat = getPatternState();
    const tf = getPatternTransform();

    let { targetW, targetH, dpi } = getExportSettings(w,h, overrides);
    // Cap total output pixels to avoid crashes on huge sizes
    try {
      const maxPx = (window.MAX_PIXELS && Number.isFinite(window.MAX_PIXELS)) ? window.MAX_PIXELS : 50_000_000;
      const total = Math.max(1, Math.floor(targetW)) * Math.max(1, Math.floor(targetH));
      if (total > maxPx) {
        const scale = Math.sqrt(maxPx / total);
        targetW = Math.max(1, Math.floor(targetW * scale));
        targetH = Math.max(1, Math.floor(targetH * scale));
      }
    } catch {}
    try { console.info('[export] resolved', { width: targetW, height: targetH, dpi: dpi||null }); } catch {}
    const canvas = document.createElement('canvas');
    // 出力ピクセル数は指定どおり（DPR非依存）
    canvas.width = Math.round(targetW);
    canvas.height = Math.round(targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return alert('Canvasコンテキスト取得に失敗しました');
    // プレビュー座標系 (w,h) → 出力座標系 (targetW,targetH) へ線形変換
    const sx = (targetW / w);
    const sy = (targetH / h);
    ctx.scale(sx, sy);
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
      let canvases = [];
      const customSel = (document.body.getAttribute('data-user-elements')||'').split(',').map(s=>s.trim()).filter(Boolean);
      if (customSel.length){
        customSel.forEach(sel => {
          try { canvases.push(...Array.from(document.querySelectorAll(sel)).filter(e=>e.tagName==='CANVAS')); } catch {}
        });
      }
      if (!canvases.length && container) canvases = Array.from(container.querySelectorAll('canvas'));
      if (!canvases.length) canvases = Array.from(document.querySelectorAll('#renderCanvas, .konvajs-content canvas, canvas'));
      canvases = canvases.filter(isVisible);
      for (const cnv of canvases) {
        const cw = cnv.width || cnv.getBoundingClientRect().width;
        const ch = cnv.height || cnv.getBoundingClientRect().height;
        if (!cw || !ch) continue;
        // If canvas matches preview size ratio closely, stretch; else fit by height
        const ratio = cw / ch;
        const dwByH = h * ratio;
        const dx = Math.round((w - dwByH) / 2);
        ctx.drawImage(cnv, 0, 0, cw, ch, dx, 0, Math.round(dwByH), h);
      }
    } catch {}

    // Draw CSS background-image elements (common for image-input previews)
    try {
      const cont = getContainer();
      const rectC = cont ? cont.getBoundingClientRect() : {left:0, top:0, width: w, height: h};
      let nodes = [];
      const customSel = (document.body.getAttribute('data-user-elements')||'').split(',').map(s=>s.trim()).filter(Boolean);
      if (customSel.length){
        customSel.forEach(sel => { try { nodes.push(...Array.from(document.querySelectorAll(sel))); } catch {} });
      }
      if (!nodes.length && cont) nodes = Array.from(cont.querySelectorAll('*'));
      if (!nodes.length) nodes = Array.from(document.querySelectorAll('[data-role="image-input"], .image-input, .preview-image'));
      for (const el of nodes) {
        if (!isVisible(el)) continue;
        const cs = getComputedStyle(el);
        const src = parseBgUrl(cs.backgroundImage);
        if (!src) continue;
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
    } catch {}

    // Draw all visible IMG elements (except overlay), in DOM order
    try {
      const cont = getContainer();
      const rectC = cont ? cont.getBoundingClientRect() : {left:0, top:0};
      const selectors = ['img.user-input', 'img[data-role="preview"]', '#previewImage', 'img'];
      let imgs = [];
      for (const sel of selectors) { try { imgs.push(...Array.from((cont||document).querySelectorAll(sel))); } catch {} }
      imgs = imgs.filter(el => el.id !== 'patternOverlay' && isVisible(el));
      for (const el of imgs) {
        const rect = el.getBoundingClientRect();
        const dx = Math.round(rect.left - rectC.left);
        const dy = Math.round(rect.top - rectC.top);
        const dw = Math.round(rect.width);
        const dh = Math.round(rect.height);
        try {
          ctx.drawImage(el, dx, dy, dw, dh);
        } catch {
          const im = await loadImage(el.src);
          if (im && im.naturalWidth && im.naturalHeight) ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, dx, dy, dw, dh);
        }
      }
    } catch {}

    // Pattern is already drawn before user content to keep it below image input

    // Trigger download
    try {
      const a = document.createElement('a');
      a.download = 'preview.png';
      const outURL = toDataURLWithDPI(canvas, 'image/png', dpi);
      try { console.info('[export] png size', { width: canvas.width, height: canvas.height, dpiWritten: dpi||null }); } catch {}
      a.href = outURL;
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
    const handler = (e) => {
      try { e.preventDefault(); e.stopImmediatePropagation(); } catch {};
      // Allow per-button data attributes to override
      const ds = btn.dataset || {};
      const ov = {};
      if (ds.exportWidth) ov.width = parseFloat(ds.exportWidth);
      if (ds.exportHeight) ov.height = parseFloat(ds.exportHeight);
      if (ds.exportDpi) ov.dpi = parseFloat(ds.exportDpi);
      exportPNG(ov);
    };
    btn.addEventListener('click', handler, { capture: true });
  }

  function init(){ attachToExistingButton(); window.exportPreviewPNG = exportPNG; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
