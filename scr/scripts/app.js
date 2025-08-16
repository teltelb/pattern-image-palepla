// Pattern Image Tool (Client-side, DPI-aware PNG export)

const el = (id) => document.getElementById(id);
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

const MAX_IMAGES = 4;
const MAX_PIXELS = 50_000_000; // safety cap for export canvas (e.g., 8000x6250)

const state = {
  images: [], // { id, source: ImageBitmap|HTMLImageElement, name, w, h, scale }
  patternType: 'tile', // 固定（タイル）
  randomSeed: Math.floor(Math.random() * 1e9),
  rotationEnabled: true,
  layout: 'auto',
  export: { width: 1024, height: 1024, unit: 'px', dpi: 300 },
  grid: { cols: 8, rows: 6 },
  options: { rectCells: true },
  presetVisible: true,
};

function setupThemeToggle() {
  const btn = el('themeToggle');
  btn?.addEventListener('click', () => {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === 'light' ? 'dark' : 'light';
  });
}

// Preview canvas background toggle (white/black only; preview-only)
function setupCanvasBgToggle() {
  const container = document.getElementById('bgToggle');
  const canvasEl = document.getElementById('preview');
  if (!container || !canvasEl) return;

  const apply = (mode) => {
    const m = mode === 'black' ? 'black' : 'white';
    canvasEl.classList.toggle('bg-white', m === 'white');
    canvasEl.classList.toggle('bg-black', m === 'black');
    try { localStorage.setItem('gpt5_preview_bg', m); } catch {}
    const btns = container.querySelectorAll('button[data-bg]');
    btns.forEach(b => b.classList.toggle('active', b.dataset.bg === m));
  };

  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('gpt5_preview_bg')) || 'white';
  apply(saved);

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-bg]');
    if (!btn) return;
    apply(btn.dataset.bg);
  });
}

function setupInputs() {
  const map = [el('file0'), el('file1'), el('file2'), el('file3')];
  map.forEach((input, idx) => {
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      await loadImageAtIndex(f, idx);
      render();
      syncScaleControls();
    });
  });

  // Slot click & DnD
  const slots = qsa('#inputList .slot');
  slots.forEach((slot) => {
    const idx = Number(slot.getAttribute('data-index')) || 0;
    slot.addEventListener('click', () => map[idx].click());
    ;['dragenter','dragover'].forEach(evt => slot.addEventListener(evt, e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }));
    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
      if (f) {
        await loadImageAtIndex(f, idx);
        render();
        syncScaleControls();
      }
    });
  });

  // List-wide DnD (sequential fill)
  const inputList = el('inputList');
  ;['dragenter','dragover'].forEach(evt => inputList.addEventListener(evt, e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }));
  inputList.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
    for (let i = 0; i < files.length; i++) {
      await loadImageAtIndex(files[i], i);
    }
    render();
    syncScaleControls();
  });

  el('clearBtn').addEventListener('click', () => { state.images = []; updateSlots(); render(); syncScaleControls(); });

  // Per-image scale controls (slider + numeric)
  qsa('.scale-slider').forEach((sld) => {
    sld.addEventListener('input', (e) => {
      const idx = clampInt(e.target.getAttribute('data-index'), 0, 3, 0);
      const v = clampInt(e.target.value, 1, 100, 80);
      if (!state.images[idx]) state.images[idx] = { id: idx, scale: v };
      state.images[idx].scale = v;
      const num = qs(`.scale-num[data-index="${idx}"]`);
      if (num) num.value = String(v);
      render();
    });
  });
  qsa('.scale-num').forEach((num) => {
    num.addEventListener('input', (e) => {
      const idx = clampInt(e.target.getAttribute('data-index'), 0, 3, 0);
      const v = clampInt(e.target.value, 1, 100, 80);
      if (!state.images[idx]) state.images[idx] = { id: idx, scale: v };
      state.images[idx].scale = v;
      const sld = qs(`.scale-slider[data-index="${idx}"]`);
      if (sld) sld.value = String(v);
      render();
    });
  });

  el('randRotBtn').addEventListener('click', () => { state.rotationEnabled = true; state.randomSeed = (state.randomSeed + 1) >>> 0; render(); });
  const zeroBtn = el('zeroRotBtn');
  if (zeroBtn) zeroBtn.addEventListener('click', () => { state.rotationEnabled = false; render(); });

  // Output & grid & options
  el('unit').addEventListener('change', (e) => { state.export.unit = e.target.value; updatePreviewSize(); render(); });
  el('width').addEventListener('input', (e) => { state.export.width = Number(e.target.value || 0); updatePreviewSize(); render(); });
  el('height').addEventListener('input', (e) => { state.export.height = Number(e.target.value || 0); updatePreviewSize(); render(); });
  el('dpi').addEventListener('input', (e) => { state.export.dpi = Number(e.target.value || 300); });
  el('preset').addEventListener('change', (e) => { applyPreset(e.target.value); updatePreviewSize(); render(); updateDeletePresetState(); tryApplyGridForPreset(e.target.value); });
  // Custom preset controls
  const saveBtn = el('savePresetBtn');
  if (saveBtn) saveBtn.addEventListener('click', onSavePreset);
  // 追加: プリセット保存時にグリッド値も保存
  if (saveBtn) saveBtn.addEventListener('click', () => {
    try {
      const name = el('presetName')?.value?.trim();
      if (!name) return;
      const cols = clampInt(el('gridCols')?.value, 1, 50, state.grid.cols);
      const rows = clampInt(el('gridRows')?.value, 1, 50, state.grid.rows);
      setPresetGrid(name, { cols, rows });
    } catch {}
  });
  const delBtn = el('deletePresetBtn');
  if (delBtn) delBtn.addEventListener('click', onDeletePreset);
  // 追加: カスタム削除時にグリッド保存も削除
  if (delBtn) delBtn.addEventListener('click', () => {
    try {
      const sel = el('preset');
      const key = sel?.value || '';
      if (!key) return;
      removePresetGrid(key);
    } catch {}
  });

  el('gridCols').addEventListener('input', (e) => { const v = clampInt(e.target.value, 1, 50, 8); state.grid.cols = v; render(); });
  el('gridRows').addEventListener('input', (e) => { const v = clampInt(e.target.value, 1, 50, 6); state.grid.rows = v; render(); });
  el('rectCells').addEventListener('change', (e) => { state.options.rectCells = !!e.target.checked; render(); });

  // View / Export
  const fit = el('fitBtn');
  if (fit) fit.addEventListener('click', () => { updatePreviewSize(true); render(); });
  const exp = el('exportBtn');
  if (exp) exp.addEventListener('click', () => { exportPng().catch(err => { console.error('Export failed', err); }); });

  // Preset toolbar toggle
  const tgl = el('togglePresetBtn');
  if (tgl) tgl.addEventListener('click', () => {
    state.presetVisible = !state.presetVisible;
    applyPresetVisibility();
    try { localStorage.setItem('gpt5_preset_visible', String(state.presetVisible)); } catch {}
  });
}

// --- Preset grid (cols/rows) persistence ---
const GRID_KEY = 'gpt5_preset_grid_v1';
function readPresetGridMap() {
  try { const s = localStorage.getItem(GRID_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function writePresetGridMap(map) {
  try { localStorage.setItem(GRID_KEY, JSON.stringify(map)); } catch {}
}
function setPresetGrid(name, grid) {
  const map = readPresetGridMap(); map[name] = { cols: Number(grid.cols)||state.grid.cols, rows: Number(grid.rows)||state.grid.rows }; writePresetGridMap(map);
}
function removePresetGrid(name) {
  const map = readPresetGridMap(); if (map && Object.prototype.hasOwnProperty.call(map, name)) { delete map[name]; writePresetGridMap(map); }
}
function tryApplyGridForPreset(name) {
  if (!name) return;
  const map = readPresetGridMap(); const g = map[name]; if (!g) return;
  const cols = clampInt(g.cols, 1, 50, state.grid.cols);
  const rows = clampInt(g.rows, 1, 50, state.grid.rows);
  state.grid.cols = cols; state.grid.rows = rows;
  const ce = el('gridCols'); if (ce) ce.value = String(cols);
  const re = el('gridRows'); if (re) re.value = String(rows);
  render();
}

async function loadImageAtIndex(file, idx) {
  const asset = await loadAsset(file).catch((e) => {
    console.error('画像の読み込みに失敗しました', e);
    alert('画像の読み込みに失敗しました。別の画像でお試しください。');
    return null;
  });
  if (!asset) return;
  state.images[idx] = { id: idx, scale: state.images[idx]?.scale ?? 80, ...asset };
  updateSlots();
}

async function loadAsset(file) {
  // Try ImageBitmap first
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, name: file.name, w: bitmap.width, h: bitmap.height };
  } catch (e) {
    // Fallback to HTMLImageElement
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    URL.revokeObjectURL(url);
    return { source: img, name: file.name, w: img.naturalWidth, h: img.naturalHeight };
  }
}

function updateSlots() {
  qsa('#inputList .slot').forEach((slot, i) => {
    const img = qs('img', slot);
    const asset = state.images[i];
    if (asset && asset.source) {
      img.hidden = false;
      thumbnailToImg(asset, img);
    } else {
      img.hidden = true; img.removeAttribute('src');
    }
  });
  // Also update visibility of per-row controls
  updateControlVisibility();
}

function thumbnailToImg(asset, imgEl) {
  const w = 300, h = 300;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0000'; ctx.fillRect(0,0,w,h);
  const src = asset.source; const sw = asset.w || src.width; const sh = asset.h || src.height;
  const r = Math.min(w / sw, h / sh);
  const dw = sw * r, dh = sh * r;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;
  ctx.drawImage(src, dx, dy, dw, dh);
  imgEl.src = c.toDataURL('image/png');
}

function autoLayout(count) {
  if (state.layout !== 'auto') return state.layout;
  if (count <= 1) return '1x1';
  if (count === 2) return '2x1';
  return '2x2';
}

function drawPattern(canvas, ctx, cfg, images) {
  // Compute cell size from requested grid counts
  const pad = 8; // margin
  const availW = Math.max(1, canvas.width - pad * 2);
  const availH = Math.max(1, canvas.height - pad * 2);
  const cols = Math.max(1, state.grid.cols | 0);
  const rows = Math.max(1, state.grid.rows | 0);

  let w, h;
  if (state.options.rectCells) {
    // Fill area with rectangular cells
    w = Math.floor(availW / cols);
    h = Math.floor(availH / rows);
  } else {
    // Square cells
    const cellSize = Math.min(availW / cols, availH / rows);
    w = Math.floor(cellSize);
    h = Math.floor(cellSize);
  }

  // Total area (centers are used; odd rows shift by w/2 but edges remain within cols*w)
  const totalW = cols * w;
  const totalH = rows * h;
  const startX = Math.floor((canvas.width - totalW) / 2);
  const startY = Math.floor((canvas.height - totalH) / 2);

  ctx.save();
  // Do NOT fill background; keep canvas transparent for export/preview

  const list = images.filter(Boolean);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // offset pattern: shift odd rows by half cell
      const shift = (cfg.type === 'offset' && (row % 2 === 1)) ? Math.floor(w / 2) : 0;
      const x = startX + col * w + shift;
      const y = startY + row * h;

      // 1つアキ配置: (row+col)偶数セルのみ描画
      if (((row + col) & 1) === 1) continue;

      // choose asset diagonally with gap: floor((row+col)/2)
      const count = list.length;
      const diagIdx = Math.floor((row + col) / 2);
      const asset = count <= 1 ? list[0] : list[diagIdx % count];
      if (!asset) continue;

      const scalePct = asset.scale ?? 100;
      const angle = state.rotationEnabled ? randomAngle(row, col, state.randomSeed) : 0;

      ctx.save();
      ctx.translate(x + w/2, y + h/2);
      if (angle) ctx.rotate(angle);
      drawAssetCover(ctx, asset, -w/2, -h/2, w, h, scalePct / 100);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawAssetCover(ctx, asset, x, y, w, h, scaleMul = 1) {
  const sw = asset.w || asset.source.width; const sh = asset.h || asset.source.height;
  let r = Math.max(w / sw, h / sh);
  r *= Math.max(0.01, scaleMul);
  const dw = sw * r; const dh = sh * r;
  const sx = x + (w - dw) / 2; const sy = y + (h - dh) / 2;
  ctx.drawImage(asset.source, sx, sy, dw, dh);
}

// Deterministic pseudo-random angle per cell (0..360deg)
function randomAngle(row, col, seed) {
  let s = (seed ^ (row * 73856093) ^ (col * 19349663)) >>> 0;
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
  const u = (s % 10000) / 10000; // 0..1
  const deg = (u * 360);
  return (deg * Math.PI) / 180;
}

function applyPreset(key) {
  const w = el('width'), h = el('height'), unit = el('unit'), dpi = el('dpi');
  switch (key) {
    case 'a4-300':
      unit.value = 'mm'; w.value = '210'; h.value = '297'; dpi.value = '300';
      state.export = { width: 210, height: 297, unit: 'mm', dpi: 300 };
      break;
    case 'square-1024':
      unit.value = 'px'; w.value = '1024'; h.value = '1024';
      state.export = { width: 1024, height: 1024, unit: 'px', dpi: state.export.dpi };
      break;
    case 'square-2048':
      unit.value = 'px'; w.value = '2048'; h.value = '2048';
      state.export = { width: 2048, height: 2048, unit: 'px', dpi: state.export.dpi };
      break;
    default:
      if (key && key.startsWith('c:')) {
        const id = key.slice(2);
        const p = state.customPresets.find(x => x.id === id);
        if (p) {
          unit.value = p.unit; w.value = String(p.width); h.value = String(p.height); dpi.value = String(p.dpi);
          state.export = { width: p.width, height: p.height, unit: p.unit, dpi: p.dpi };
          state.grid.cols = p.cols; state.grid.rows = p.rows;
          const gc = el('gridCols'), gr = el('gridRows');
          if (gc) gc.value = String(p.cols);
          if (gr) gr.value = String(p.rows);
        }
      }
      break;
  }
}

// Presets storage
const PRESET_KEY = 'gpt5_pattern_custom_presets_v1';
function loadCustomPresets() {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [];
}
function saveCustomPresets(arr) {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(arr)); } catch {}
}
function uid() { return Math.random().toString(36).slice(2, 10); }

function refreshPresetSelect(selectId = 'preset') {
  const sel = el(selectId);
  if (!sel) return;
  const current = sel.value;
  // rebuild
  sel.innerHTML = '';
  const def = document.createElement('option'); def.value=''; def.textContent='選択'; sel.appendChild(def);
  const b1 = document.createElement('option'); b1.value='a4-300'; b1.textContent='A4 300dpi'; sel.appendChild(b1);
  const b2 = document.createElement('option'); b2.value='square-1024'; b2.textContent='正方形 1024px'; sel.appendChild(b2);
  const b3 = document.createElement('option'); b3.value='square-2048'; b3.textContent='正方形 2048px'; sel.appendChild(b3);
  if (state.customPresets.length) {
    const sep = document.createElement('option'); sep.disabled = true; sep.textContent = '──────────'; sel.appendChild(sep);
    state.customPresets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = `c:${p.id}`;
      opt.textContent = `★ ${p.name} (${p.width}x${p.height}${p.unit}, ${p.cols}x${p.rows}, ${p.dpi}dpi)`;
      sel.appendChild(opt);
    });
  }
  // keep previous selection if possible
  const opts = Array.from(sel.options).map(o=>o.value);
  sel.value = opts.includes(current) ? current : '';
  updateDeletePresetState();
}

function updateDeletePresetState() {
  const del = el('deletePresetBtn'); const sel = el('preset');
  if (!del || !sel) return;
  const v = sel.value;
  del.disabled = !(v && v.startsWith('c:'));
}

function onSavePreset() {
  const nameEl = el('presetName');
  const name = (nameEl?.value || '').trim();
  if (!name) { alert('プリセット名を入力してください'); return; }
  const unit = el('unit').value;
  const width = toInt(el('width').value, 1);
  const height = toInt(el('height').value, 1);
  const dpi = toInt(el('dpi').value, 72);
  const cols = toInt(el('gridCols').value, 1);
  const rows = toInt(el('gridRows').value, 1);
  const existing = state.customPresets.find(p => p.name === name);
  if (existing) {
    Object.assign(existing, { unit, width, height, dpi, cols, rows });
  } else {
    state.customPresets.push({ id: uid(), name, unit, width, height, dpi, cols, rows });
  }
  saveCustomPresets(state.customPresets);
  refreshPresetSelect();
  // auto-select the saved preset
  const saved = state.customPresets.find(p => p.name === name);
  if (saved) {
    const sel = el('preset');
    if (sel) {
      sel.value = `c:${saved.id}`;
      applyPreset(sel.value);
      updatePreviewSize();
      render();
      updateDeletePresetState();
    }
  }
  // optional UX feedback
  console.info('プリセットを保存しました:', name);
}

function onDeletePreset() {
  const sel = el('preset');
  const v = sel.value;
  if (!v || !v.startsWith('c:')) return;
  const id = v.slice(2);
  state.customPresets = state.customPresets.filter(p => p.id !== id);
  saveCustomPresets(state.customPresets);
  refreshPresetSelect();
  sel.value = '';
  updateDeletePresetState();
}

function toPx(val, unit, dpi) {
  if (unit === 'px') return Math.max(1, Math.floor(val));
  if (unit === 'in') return Math.max(1, Math.floor(val * dpi));
  if (unit === 'mm') return Math.max(1, Math.floor((val / 25.4) * dpi));
  return Math.max(1, Math.floor(val));
}

// Safe integer parser with default fallback
function toInt(v, d = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
}

async function exportPng() {
  const { width, height, unit, dpi } = state.export;
  const widthPx = toPx(width, unit, dpi);
  const heightPx = toPx(height, unit, dpi);
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    alert('出力サイズが不正です。'); return;
  }
  if (widthPx * heightPx > MAX_PIXELS) {
    alert('出力が大きすぎます。サイズまたはDPIを下げてください。'); return;
  }
  const list = state.images.filter(Boolean);
  if (list.length === 0) { alert('画像を追加してください。'); return; }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = widthPx; exportCanvas.height = heightPx;
  const ctx = exportCanvas.getContext('2d');

  const cfg = {
    type: 'tile',
    scale: 1,
    layout: autoLayout(list.length),
  };
  drawPattern(exportCanvas, ctx, cfg, list);

  let blob = await new Promise((res) => exportCanvas.toBlob(res, 'image/png'));
  if (!blob) {
    // Fallback for environments where toBlob may return null
    const dataUrl = exportCanvas.toDataURL('image/png');
    blob = dataURLtoBlob(dataUrl);
  }
  const patched = await writePngDpi(blob, dpi).catch(() => blob);
  const filename = `pattern_${widthPx}x${heightPx}_${dpi}dpi.png`;
  const url = URL.createObjectURL(patched);
  // Trigger download and clean up
  triggerDownload(url, filename);
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch(_){} }, 1000);
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// PNG pHYs writer
async function writePngDpi(pngBlob, dpi) {
  const buf = await pngBlob.arrayBuffer();
  const u8 = new Uint8Array(buf);
  // PNG signature
  const sig = [137,80,78,71,13,10,26,10];
  for (let i = 0; i < 8; i++) if (u8[i] !== sig[i]) throw new Error('Invalid PNG');

  // scan chunks to find IHDR and pHYs
  let pHYsIndex = -1;
  let insertAfter = 8; // after signature
  let i = 8;
  while (i < u8.length) {
    const len = readUint32(u8, i); const type = readType(u8, i + 4);
    if (type === 'IHDR') insertAfter = i + 12 + len; // move past this chunk
    if (type === 'pHYs') { pHYsIndex = i; break; }
    i += 12 + len; // length(4)+type(4)+data(len)+crc(4)
  }

  const ppm = Math.round(dpi * 39.37007874);
  const pHYsData = new Uint8Array(9);
  writeUint32(pHYsData, 0, ppm); // X
  writeUint32(pHYsData, 4, ppm); // Y
  pHYsData[8] = 1; // units: meter

  const pHYsChunk = makeChunk('pHYs', pHYsData);

  let out;
  if (pHYsIndex >= 0) {
    // replace existing pHYs chunk
    const len = readUint32(u8, pHYsIndex);
    const before = u8.slice(0, pHYsIndex);
    const after = u8.slice(pHYsIndex + 12 + len);
    out = concat(before, pHYsChunk, after);
  } else {
    // insert after IHDR
    const before = u8.slice(0, insertAfter);
    const after = u8.slice(insertAfter);
    out = concat(before, pHYsChunk, after);
  }
  return new Blob([out], { type: 'image/png' });
}

function readUint32(u8, off) {
  return (u8[off] << 24) | (u8[off+1] << 16) | (u8[off+2] << 8) | (u8[off+3]);
}
function writeUint32(u8, off, val) {
  u8[off] = (val >>> 24) & 0xff;
  u8[off+1] = (val >>> 16) & 0xff;
  u8[off+2] = (val >>> 8) & 0xff;
  u8[off+3] = (val) & 0xff;
}
function readType(u8, off) {
  return String.fromCharCode(u8[off], u8[off+1], u8[off+2], u8[off+3]);
}
function makeChunk(typeStr, data) {
  const type = new Uint8Array(typeStr.split('').map(c => c.charCodeAt(0)));
  const len = data.length;
  const out = new Uint8Array(12 + len);
  writeUint32(out, 0, len);
  out.set(type, 4);
  out.set(data, 8);
  const crc = crc32(concat(type, data));
  writeUint32(out, 8 + len, crc >>> 0);
  return out;
}
function concat(...arrs) {
  const size = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(size);
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// CRC32 table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataURLtoBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1] || 'image/png';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

function syncScaleControls() {
  for (let i = 0; i < MAX_IMAGES; i++) {
    const v = String(state.images[i]?.scale ?? 100);
    const s = qs(`.scale-slider[data-index="${i}"]`);
    const n = qs(`.scale-num[data-index="${i}"]`);
    if (s) s.value = v;
    if (n) n.value = v;
  }
}

function updateControlVisibility() {
  for (let i = 0; i < MAX_IMAGES; i++) {
    const present = !!(state.images[i] && state.images[i].source);
    const row = qs(`.input-row[data-index="${i}"]`);
    if (!row) continue;
    const ctrls = qs('.ctrls', row);
    if (ctrls) ctrls.style.display = present ? '' : 'none';
  }
}

function render() {
  const canvas = el('preview');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const list = state.images.filter(Boolean);
  if (list.length === 0) { drawEmpty(canvas, ctx); return; }
  const cfg = {
    type: 'tile',
    scale: 1,
    layout: autoLayout(list.length),
  };
  drawPattern(canvas, ctx, cfg, list);
}

function drawEmpty(canvas, ctx) {
  ctx.save();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('画像を左から追加するとプレビューします', canvas.width/2, canvas.height/2);
  ctx.restore();
}

function clampInt(val, min, max, fallback) {
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function updatePreviewSize(force = false) {
  const c = el('preview');
  const { width, height, unit, dpi } = state.export;
  const widthPx = toPx(width || 0, unit, dpi);
  const heightPx = toPx(height || 0, unit, dpi);
  let targetW = 1024, targetH = 768; // default
  if (widthPx > 0 && heightPx > 0) {
    const maxW = 1024, maxH = 768;
    const s = Math.min(maxW / widthPx, maxH / heightPx);
    targetW = Math.max(200, Math.floor(widthPx * s));
    targetH = Math.max(200, Math.floor(heightPx * s));
  }
  if (force || c.width !== targetW || c.height !== targetH) {
    c.width = targetW; c.height = targetH;
  }
}

// init (one-time guard to avoid duplicate listeners)
if (window.__GPT5_INIT__) {
  console.debug('GPT5PatternTool already initialized; skipping re-init');
} else {
  window.__GPT5_INIT__ = true;
  // Load custom presets and build select
  state.customPresets = loadCustomPresets();
  refreshPresetSelect();

  setupThemeToggle();
  setupInputs();
  // Restore preset toolbar visibility
  try { const pv = localStorage.getItem('gpt5_preset_visible'); if (pv !== null) state.presetVisible = pv === 'true'; } catch {}
  updatePreviewSize(true);
  render();
  syncScaleControls();
  updateControlVisibility();
  updateDeletePresetState();
  applyPresetVisibility();
}

function applyPresetVisibility() {
  const bar = el('presetToolbar');
  const btn = el('togglePresetBtn');
  if (!bar) return;
  if (state.presetVisible) {
    bar.style.display = '';
    if (btn) btn.textContent = 'プリセットを隠す';
  } else {
    bar.style.display = 'none';
    if (btn) btn.textContent = 'プリセットを表示';
  }
}
