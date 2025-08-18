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
    let dpi = overrides?.dpi || readNum(['#exportDpi','[name="exportDpi"]']);
    if (!dpi && ds.exportDpi) dpi = parseFloat(ds.exportDpi);
    const hash = parseHashExport();
    let w = overrides?.width || (hash?.width) || readNum(['#exportWidth','[name="exportWidth"]']);
    let h = overrides?.height || (hash?.height) || readNum(['#exportHeight','[name="exportHeight"]']);
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
      // insert pHYs after IHDR
      const pngSig = [137,80,78,71,13,10,26,10];
      for (let i=0;i<8;i++) if (bytes[i]!==pngSig[i]) return dataURL;
      let pos = 8;
      // IHDR
      const ihdrLen = (bytes[pos]<<24)|(bytes[pos+1]<<16)|(bytes[pos+2]<<8)|bytes[pos+3];
      pos += 4; // len
      const type = String.fromCharCode(bytes[pos],bytes[pos+1],bytes[pos+2],bytes[pos+3]);
      if (type !== 'IHDR') return dataURL;
      pos += 4 + ihdrLen + 4; // skip IHDR chunk+CRC
      const ppm = Math.round((dpi) * 39.37007874);
      const pHYsData = new Uint8Array(9);
      pHYsData[0]=(ppm>>>24)&255; pHYsData[1]=(ppm>>>16)&255; pHYsData[2]=(ppm>>>8)&255; pHYsData[3]=ppm&255;
      pHYsData[4]=(ppm>>>24)&255; pHYsData[5]=(ppm>>>16)&255; pHYsData[6]=(ppm>>>8)&255; pHYsData[7]=ppm&255;
      pHYsData[8]=1; // unit: meter
      const chunkType = new Uint8Array([112,72,89,115]); // 'pHYs'
      const length = new Uint8Array([0,0,0,9]);
      // CRC32
      function crc32(arr){
        let c = ~0; const tbl = (function(){
          const t = new Uint32Array(256);
          for (let n=0;n<256;n++){ let c=n; for (let k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c; }
          return t;
        })();
        for (let i=0;i<arr.length;i++) c = tbl[(c^arr[i])&255] ^ (c>>>8);
        return (~c)>>>0;
      }
      const crcInput = new Uint8Array(4 + pHYsData.length);
      crcInput.set(chunkType,0); crcInput.set(pHYsData,4);
      const crc = crc32(crcInput);
      const crcBytes = new Uint8Array([ (crc>>>24)&255, (crc>>>16)&255, (crc>>>8)&255, crc&255 ]);
      // Assemble new PNG: sig + upToPos + pHYs + rest
      const before = bytes.slice(0,pos);
      const after = bytes.slice(pos);
      const total = new Uint8Array(before.length + 4 + 4 + pHYsData.length + 4 + after.length);
      let o=0; total.set(before,o); o+=before.length;
      total.set(length,o); o+=4; total.set(chunkType,o); o+=4; total.set(pHYsData,o); o+=pHYsData.length; total.set(crcBytes,o); o+=4;
      total.set(after,o);
      let out=''; for (let i=0;i<total.length;i++) out+=String.fromCharCode(total[i]);
      return 'data:image/png;base64,' + btoa(out);
    } catch {
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

    const { targetW, targetH, dpi } = getExportSettings(w,h, overrides);
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
      a.href = toDataURLWithDPI(canvas, 'image/png', dpi);
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
