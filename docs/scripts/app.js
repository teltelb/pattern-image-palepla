// GPT5 Pattern Tool - Clean UTF-8 rebuild
const APP_VERSION = '2025-08-16-1';

const el = (id) => document.getElementById(id);
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

const MAX_IMAGES = 4;
const MAX_PIXELS = 50_000_000;

const state = {
  images: [], // { id, source, name, w, h, scale }
  randomSeed: Math.floor(Math.random() * 1e9),
  rotationEnabled: true,
  export: { width: 1000, height: 1000, unit: 'px', dpi: 300 },
  grid: { cols: 5, rows: 5 },
  options: { rectCells: true },
  presetVisible: true,
  custom: { enabled: false, repeat: { cols: 2, rows: 2 }, map: [0,1,2,3] },
  customPresets: [],
};

function setupThemeToggle() {
  const btn = el('themeToggle');
  btn?.addEventListener('click', () => {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === 'light' ? 'dark' : 'light';
  });
}

function setupCanvasBgToggle() {
  const container = document.getElementById('bgToggle');
  const canvasEl = document.getElementById('preview');
  if (!container || !canvasEl) return;
  const apply = (mode) => {
    const m = mode === 'black' ? 'black' : 'white';
    canvasEl.classList.toggle('bg-white', m === 'white');
    canvasEl.classList.toggle('bg-black', m === 'black');
    try { localStorage.setItem('gpt5_preview_bg', m); } catch {}
    container.querySelectorAll('button[data-bg]')
      .forEach(b => b.classList.toggle('active', b.dataset.bg === m));
  };
  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('gpt5_preview_bg')) || 'white';
  apply(saved);
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-bg]'); if (!btn) return; apply(btn.dataset.bg);
  });
}

function setupInputs() {
  const map = [el('file0'), el('file1'), el('file2'), el('file3')];
  map.forEach((input, idx) => {
    input.addEventListener('change', async () => {
      const f = input.files?.[0]; if (!f) return;
      await loadImageAtIndex(f, idx);
      render(); syncScaleControls();
    });
  });

  // Slot click & DnD
  const slots = qsa('#inputList .slot');
  slots.forEach((slot) => {
    const idx = Number(slot.getAttribute('data-index')) || 0;
    slot.addEventListener('click', () => map[idx].click());
    ['dragenter','dragover'].forEach(evt => slot.addEventListener(evt, e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }));
    slot.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
      if (f) { await loadImageAtIndex(f, idx); render(); syncScaleControls(); }
    });
  });

  // Per-slot delete buttons
  qsa('#inputList .slot .slot-del').forEach((btn) => {
    const idx = Number(btn.getAttribute('data-index')) || 0;
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const prev = state.images[idx] || { id: idx };
      state.images[idx] = { id: idx, scale: prev.scale ?? 80 };
      try { if (map[idx]) map[idx].value = ''; } catch {}
      updateSlots(); render(); syncScaleControls();
    });
  });

  // List-wide DnD (sequential fill)
  const inputList = el('inputList');
  ['dragenter','dragover'].forEach(evt => inputList.addEventListener(evt, e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }));
  inputList.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
    for (let i = 0; i < files.length; i++) await loadImageAtIndex(files[i], i);
    render(); syncScaleControls();
  });

  el('clearBtn')?.addEventListener('click', () => { state.images = []; updateSlots(); render(); syncScaleControls(); });

  // Global scale controls
  const gSld = el('globalScaleSlider');
  const gNum = el('globalScaleNum');
  if (gSld) gSld.addEventListener('input', () => {
    const v = clampInt(gSld.value, 1, 100, 100);
    if (gNum) gNum.value = String(v);
    applyGlobalScale(v);
  });
  if (gNum) gNum.addEventListener('input', () => {
    const v = clampInt(gNum.value, 1, 100, 100);
    if (gSld) gSld.value = String(v);
    applyGlobalScale(v);
  });

  // Per-image scale controls
  qsa('.scale-slider').forEach((sld) => {
    sld.addEventListener('input', (e) => {
      const idx = clampInt(e.target.getAttribute('data-index'), 0, 3, 0);
      const v = clampInt(e.target.value, 1, 100, 80);
      if (!state.images[idx]) state.images[idx] = { id: idx, scale: v };
      state.images[idx].scale = v;
      const num = qs(`.scale-num[data-index="${idx}"]`); if (num) num.value = String(v);
      render();
    });
  });
  qsa('.scale-num').forEach((num) => {
    num.addEventListener('input', (e) => {
      const idx = clampInt(e.target.getAttribute('data-index'), 0, 3, 0);
      const v = clampInt(e.target.value, 1, 100, 80);
      if (!state.images[idx]) state.images[idx] = { id: idx, scale: v };
      state.images[idx].scale = v;
      const sld = qs(`.scale-slider[data-index="${idx}"]`); if (sld) sld.value = String(v);
      render();
    });
  });

  // Pattern controls
  el('randRotBtn')?.addEventListener('click', () => { state.rotationEnabled = true; state.randomSeed = (state.randomSeed + 1) >>> 0; render(); });
  el('zeroRotBtn')?.addEventListener('click', () => { state.rotationEnabled = false; render(); });

  // Output & grid
  el('unit')?.addEventListener('change', (e) => { state.export.unit = e.target.value; updatePreviewSize(); render(); });
  el('width')?.addEventListener('input', (e) => { state.export.width = Number(e.target.value || 0); updatePreviewSize(); render(); });
  el('height')?.addEventListener('input', (e) => { state.export.height = Number(e.target.value || 0); updatePreviewSize(); render(); });
  el('dpi')?.addEventListener('input', (e) => { state.export.dpi = Number(e.target.value || 300); });

  el('gridCols')?.addEventListener('input', (e) => { state.grid.cols = clampInt(e.target.value, 1, 50, state.grid.cols); render(); });
  el('gridRows')?.addEventListener('input', (e) => { state.grid.rows = clampInt(e.target.value, 1, 50, state.grid.rows); render(); });
  el('rectCells')?.addEventListener('change', (e) => { state.options.rectCells = !!e.target.checked; render(); });

  // Export (capture phase to避ける: 他スクリプトのクリック捕捉)
  el('exportBtn')?.addEventListener('click', (e) => { try { e.preventDefault(); e.stopImmediatePropagation(); } catch {} exportPng().catch(err => console.error('Export failed', err)); }, { capture: true });
  el('exportTransparentBtn')?.addEventListener('click', (e) => { try { e.preventDefault(); e.stopImmediatePropagation(); } catch {} exportPng().catch(err => console.error('Export failed', err)); }, { capture: true });
  el('exportCompositeBtn')?.addEventListener('click', (e) => { try { e.preventDefault(); e.stopImmediatePropagation(); } catch {} exportComposite().catch(err => console.error('Composite export failed', err)); }, { capture: true });

  // Presets
  el('preset')?.addEventListener('change', (e) => { applyPreset(e.target.value); updatePreviewSize(); render(); updateDeletePresetState(); });
  el('savePresetBtn')?.addEventListener('click', onSavePreset);
  el('deletePresetBtn')?.addEventListener('click', onDeletePreset);
  el('exportPresetsBtn')?.addEventListener('click', onExportPresets);
  el('importPresetsBtn')?.addEventListener('click', () => el('importPresetsFile')?.click());
  el('importPresetsFile')?.addEventListener('change', onImportPresetsFile);

  // Preset toolbar toggle
  el('togglePresetBtn')?.addEventListener('click', () => {
    state.presetVisible = !state.presetVisible; applyPresetVisibility();
    try { localStorage.setItem('gpt5_preset_visible', String(state.presetVisible)); } catch {}
  });

  // Custom layout controls
  el('openLayoutEditorBtn')?.addEventListener('click', () => {
    const w = window.open('layout.html', 'gpt5_layout_editor', 'width=900,height=700');
    if (w) w.__gpt5_initialLayout = JSON.parse(JSON.stringify(state.custom || {}));
  });
  el('useCustomLayout')?.addEventListener('change', (e) => { state.custom.enabled = !!e.target.checked; render(); });
}

function updateSlots() {
  qsa('#inputList .slot').forEach((slot, i) => {
    const img = qs('img', slot);
    const asset = state.images[i];
    if (asset && asset.source) { img.hidden = false; thumbnailToImg(asset, img); }
    else { img.hidden = true; img.removeAttribute('src'); }
  });
  updateControlVisibility();
}

function thumbnailToImg(asset, imgEl) {
  const w = 300, h = 300;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0000'; ctx.fillRect(0,0,w,h);
  const sw = asset.w || asset.source.width; const sh = asset.h || asset.source.height;
  const r = Math.min(w / sw, h / sh);
  const dw = sw * r, dh = sh * r; const dx = (w - dw) / 2, dy = (h - dh) / 2;
  ctx.drawImage(asset.source, dx, dy, dw, dh);
  imgEl.src = c.toDataURL('image/png');
}

async function loadImageAtIndex(file, idx) {
  const asset = await loadAsset(file).catch((e) => { console.error('画像の読み込みに失敗しました', e); alert('画像の読み込みに失敗しました。別の画像でお試しください'); return null; });
  if (!asset) return;
  state.images[idx] = { id: idx, scale: state.images[idx]?.scale ?? 80, ...asset };
  updateSlots();
}

async function loadAsset(file) {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, name: file.name, w: bitmap.width, h: bitmap.height };
  } catch {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    URL.revokeObjectURL(url);
    return { source: img, name: file.name, w: img.naturalWidth, h: img.naturalHeight };
  }
}

function updateControlVisibility() {
  // Always show scale controls so defaults can be set pre-upload
  for (let i = 0; i < MAX_IMAGES; i++) {
    const row = qs(`.input-row[data-index="${i}"]`);
    if (!row) continue; const ctrls = qs('.ctrls', row); if (ctrls) ctrls.style.display = '';
  }
}

function syncScaleControls() {
  for (let i = 0; i < MAX_IMAGES; i++) {
    const v = String(state.images[i]?.scale ?? 80);
    const s = qs(`.scale-slider[data-index="${i}"]`); const n = qs(`.scale-num[data-index="${i}"]`);
    if (s) s.value = v; if (n) n.value = v;
  }
  syncGlobalScaleFromState();
}

function applyGlobalScale(v) {
  for (let i = 0; i < MAX_IMAGES; i++) {
    if (!state.images[i]) state.images[i] = { id: i, scale: v }; else state.images[i].scale = v;
    const sld = qs(`.scale-slider[data-index="${i}"]`); if (sld) sld.value = String(v);
    const num = qs(`.scale-num[data-index="${i}"]`); if (num) num.value = String(v);
  }
  render();
}

function syncGlobalScaleFromState() {
  const vals = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    const val = state.images[i]?.scale; if (Number.isFinite(val)) vals.push(val);
  }
  const gSld = el('globalScaleSlider'); const gNum = el('globalScaleNum');
  if (!gSld && !gNum) return;
  const v = vals.length ? vals[0] : 80;
  if (gSld) gSld.value = String(v);
  if (gNum) gNum.value = String(v);
}

function render() {
  const canvas = el('preview');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const list = state.images.filter(a => a && a.source);
  if (list.length === 0) { drawEmpty(canvas, ctx); return; }
  drawPattern(canvas, ctx, list);
}

function drawEmpty(canvas, ctx) {
  ctx.save();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('画像を左から追加するとプレビューします', canvas.width/2, canvas.height/2);
  ctx.restore();
}

function drawPattern(canvas, ctx, images) {
  const pad = 8;
  const availW = Math.max(1, canvas.width - pad * 2);
  const availH = Math.max(1, canvas.height - pad * 2);
  const cols = Math.max(1, state.grid.cols | 0);
  const rows = Math.max(1, state.grid.rows | 0);

  let w, h;
  if (state.options.rectCells) {
    w = Math.floor(availW / cols); h = Math.floor(availH / rows);
  } else {
    const cell = Math.min(availW / cols, availH / rows); w = Math.floor(cell); h = Math.floor(cell);
  }
  const totalW = cols * w; const totalH = rows * h;
  const startX = Math.floor((canvas.width - totalW) / 2);
  const startY = Math.floor((canvas.height - totalH) / 2);

  ctx.save();

  // Custom layout mode: fill every cell according to repeating map
  const useCustom = !!state.custom?.enabled && Array.isArray(state.custom?.map) && state.custom.map.length > 0;
  const repCols = clampInt(state.custom?.repeat?.cols, 1, 100, 2);
  const repRows = clampInt(state.custom?.repeat?.rows, 1, 100, 2);
  if (useCustom) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * w; const y = startY + row * h;
        const mi = (row % repRows) * repCols + (col % repCols);
        const which = state.custom.map[mi]; if (which == null || which === -1) continue;
        const asset = images[which]; if (!asset) continue;
        const scalePct = asset.scale ?? 100;
        const angle = state.rotationEnabled ? randomAngle(row, col, state.randomSeed) : 0;
        ctx.save(); ctx.translate(x + w/2, y + h/2); if (angle) ctx.rotate(angle);
        drawAssetCover(ctx, asset, -w/2, -h/2, w, h, scalePct / 100); ctx.restore();
      }
    }
    ctx.restore(); return;
  }

  // Default: draw every other cell (checker pattern)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (((row + col) & 1) === 1) continue;
      const x = startX + col * w; const y = startY + row * h;

      const count = images.length; let asset;
      if (count === 4) {
        const alt = ((col >> 1) & 1);
        if ((row % 2) === 0) { // 1-based odd rows
          asset = images[alt === 0 ? 0 : 1]; // ABAB
        } else {
          asset = images[alt === 0 ? 2 : 3]; // CDCD
        }
      } else {
        const diagIdx = Math.floor((row + col) / 2);
        asset = count <= 1 ? images[0] : images[diagIdx % count];
      }
      if (!asset) continue;

      const scalePct = asset.scale ?? 100;
      const angle = state.rotationEnabled ? randomAngle(row, col, state.randomSeed) : 0;
      ctx.save(); ctx.translate(x + w/2, y + h/2); if (angle) ctx.rotate(angle);
      drawAssetCover(ctx, asset, -w/2, -h/2, w, h, scalePct / 100); ctx.restore();
    }
  }
  ctx.restore();
}

function drawAssetCover(ctx, asset, x, y, w, h, scaleMul = 1) {
  const sw = asset.w || asset.source.width; const sh = asset.h || asset.source.height;
  let r = Math.max(w / sw, h / sh) * Math.max(0.01, scaleMul);
  const dw = sw * r; const dh = sh * r; const sx = x + (w - dw) / 2; const sy = y + (h - dh) / 2;

  // Always favor high-quality interpolation for scaling to keep assets clean.
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch {}

  ctx.drawImage(asset.source, sx, sy, dw, dh);

  // Restore smoothing settings
  ctx.imageSmoothingEnabled = prevSmooth;
  try { ctx.imageSmoothingQuality = prevQuality; } catch {}
}

function randomAngle(row, col, seed) {
  let s = (seed ^ (row * 73856093) ^ (col * 19349663)) >>> 0;
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
  const u = (s % 10000) / 10000; return (u * 360 * Math.PI) / 180;
}

// Presets (custom only)
const PRESET_KEY = 'gpt5_pattern_custom_presets_v1';
function loadCustomPresets() { try { const raw = localStorage.getItem(PRESET_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
function saveCustomPresets(arr) { try { localStorage.setItem(PRESET_KEY, JSON.stringify(arr)); } catch {} }
function uid() { return Math.random().toString(36).slice(2, 10); }

function refreshPresetSelect(selectId = 'preset') {
  const sel = el(selectId); if (!sel) return; const current = sel.value; sel.innerHTML = '';
  const def = document.createElement('option'); def.value = ''; def.textContent = '選択'; sel.appendChild(def);
  (state.customPresets || []).forEach(p => {
    const opt = document.createElement('option'); opt.value = `c:${p.id}`; opt.textContent = `${p.name} (${p.width}x${p.height}${p.unit}, ${p.cols}x${p.rows}, ${p.dpi}dpi)`; sel.appendChild(opt);
  });
  const opts = Array.from(sel.options).map(o=>o.value); sel.value = opts.includes(current) ? current : '';
  updateDeletePresetState();
}

function updateDeletePresetState() {
  const del = el('deletePresetBtn'); const sel = el('preset'); if (!del || !sel) return; const v = sel.value;
  del.disabled = !(v && v.startsWith('c:'));
}

function onSavePreset() {
  const nameEl = el('presetName'); const name = (nameEl?.value || '').trim(); if (!name) { alert('プリセット名を入力してください'); return; }
  const unit = el('unit').value; const width = toInt(el('width').value, 1); const height = toInt(el('height').value, 1);
  const dpi = toInt(el('dpi').value, 72); const cols = toInt(el('gridCols').value, 1); const rows = toInt(el('gridRows').value, 1);
  const scales = Array.from({length: MAX_IMAGES}, (_,i) => clampInt(qs(`.scale-num[data-index="${i}"]`)?.value ?? (state.images[i]?.scale ?? 100), 1, 100, 100));
  const layout = { enabled: !!state.custom?.enabled, repeat: { cols: state.custom?.repeat?.cols || 2, rows: state.custom?.repeat?.rows || 2 }, map: Array.isArray(state.custom?.map) ? state.custom.map : [] };
  const existing = state.customPresets.find(p => p.name === name);
  if (existing) Object.assign(existing, { unit, width, height, dpi, cols, rows, scales, layout });
  else state.customPresets.push({ id: uid(), name, unit, width, height, dpi, cols, rows, scales, layout });
  saveCustomPresets(state.customPresets); refreshPresetSelect();
  const saved = state.customPresets.find(p => p.name === name);
  if (saved) { const sel = el('preset'); if (sel) { sel.value = `c:${saved.id}`; applyPreset(sel.value); updatePreviewSize(); render(); updateDeletePresetState(); } }
}

function onDeletePreset() {
  const sel = el('preset'); const v = sel.value; if (!v || !v.startsWith('c:')) return; const id = v.slice(2);
  state.customPresets = state.customPresets.filter(p => p.id !== id); saveCustomPresets(state.customPresets); refreshPresetSelect(); sel.value = ''; updateDeletePresetState();
}

function onExportPresets() {
  try {
    const data = JSON.stringify(state.customPresets || [], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `gpt5_presets_${ts}.json`);
    setTimeout(()=>{ try { URL.revokeObjectURL(url); } catch {} }, 1000);
  } catch (e) {
    alert('プリセットのエクスポートに失敗しました');
    console.error(e);
  }
}

function onImportPresetsFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('invalid format');
      let added = 0, updated = 0;
      const existingByName = new Map((state.customPresets||[]).map(p => [p.name, p]));
      arr.forEach(raw => {
        const p = sanitizeImportedPreset(raw);
        if (!p) return;
        const ex = existingByName.get(p.name);
        if (ex) {
          // keep existing id but replace fields
          Object.assign(ex, { unit: p.unit, width: p.width, height: p.height, dpi: p.dpi, cols: p.cols, rows: p.rows, scales: p.scales, layout: p.layout });
          updated++;
        } else {
          if (!p.id) p.id = uid();
          state.customPresets.push(p);
          existingByName.set(p.name, p);
          added++;
        }
      });
      saveCustomPresets(state.customPresets);
      refreshPresetSelect();
      alert(`インポート完了: 追加 ${added} 件 / 更新 ${updated} 件`);
      e.target.value = '';
    } catch (err) {
      alert('プリセットのインポートに失敗しました。JSON形式をご確認ください');
      console.error(err);
      e.target.value = '';
    }
  };
  reader.onerror = () => { alert('ファイルの読み込みに失敗しました'); e.target.value = ''; };
  reader.readAsText(file);
}

function sanitizeImportedPreset(x) {
  try {
    const unit = (x.unit === 'px' || x.unit === 'mm' || x.unit === 'in') ? x.unit : 'px';
    const width = toInt(x.width, 1000); const height = toInt(x.height, 1000); const dpi = toInt(x.dpi, 300);
    const cols = toInt(x.cols, 5); const rows = toInt(x.rows, 5);
    const name = (x.name || '').toString().trim(); if (!name) return null;
    const scales = Array.isArray(x.scales) ? x.scales.slice(0, MAX_IMAGES).map(v => clampInt(v, 1, 100, 80)) : [80,80,80,80];
    const layout = x.layout && typeof x.layout === 'object' ? {
      enabled: !!x.layout.enabled,
      repeat: { cols: clampInt(x.layout?.repeat?.cols, 1, 100, 2), rows: clampInt(x.layout?.repeat?.rows, 1, 100, 2) },
      map: Array.isArray(x.layout.map) ? x.layout.map.slice() : []
    } : { enabled: false, repeat: { cols: 2, rows: 2 }, map: [] };
    return { id: x.id || '', name, unit, width, height, dpi, cols, rows, scales, layout };
  } catch { return null; }
}

function applyPreset(key) {
  const w = el('width'), h = el('height'), unit = el('unit'), dpi = el('dpi');
  if (key && key.startsWith('c:')) {
    const id = key.slice(2); const p = state.customPresets.find(x => x.id === id); if (!p) return;
    unit.value = p.unit; w.value = String(p.width); h.value = String(p.height); dpi.value = String(p.dpi);
    state.export = { width: p.width, height: p.height, unit: p.unit, dpi: p.dpi };
    state.grid.cols = p.cols; state.grid.rows = p.rows; const gc = el('gridCols'), gr = el('gridRows'); if (gc) gc.value = String(p.cols); if (gr) gr.value = String(p.rows);
    if (p.layout && typeof p.layout === 'object') {
      state.custom.enabled = !!p.layout.enabled;
      state.custom.repeat = { cols: clampInt(p.layout?.repeat?.cols, 1, 100, 2), rows: clampInt(p.layout?.repeat?.rows, 1, 100, 2) };
      state.custom.map = Array.isArray(p.layout.map) ? p.layout.map.slice() : [];
      const chk = el('useCustomLayout'); if (chk) chk.checked = state.custom.enabled;
    }
    if (Array.isArray(p.scales)) {
      for (let i = 0; i < Math.min(MAX_IMAGES, p.scales.length); i++) {
        const sVal = clampInt(p.scales[i], 1, 100, null);
        if (sVal != null) {
          if (!state.images[i]) state.images[i] = { id: i, scale: sVal }; else state.images[i].scale = sVal;
          const sld = qs(`.scale-slider[data-index="${i}"]`); if (sld) sld.value = String(sVal);
          const num = qs(`.scale-num[data-index="${i}"]`); if (num) num.value = String(sVal);
        }
      }
      syncGlobalScaleFromState();
      render();
    }
  }
}

function toPx(val, unit, dpi) {
  if (unit === 'px') return Math.max(1, Math.floor(val));
  if (unit === 'in') return Math.max(1, Math.floor(val * dpi));
  if (unit === 'mm') return Math.max(1, Math.floor((val / 25.4) * dpi));
  return Math.max(1, Math.floor(val));
}
function toInt(v, d = 0) { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; }
function clampInt(val, min, max, fallback) { const n = Math.floor(Number(val)); if (!Number.isFinite(n)) return fallback; return Math.min(max, Math.max(min, n)); }

async function exportPng() {
  const { width, height, unit, dpi } = state.export;
  const widthPx = toPx(width, unit, dpi); const heightPx = toPx(height, unit, dpi);
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) { alert('出力サイズが不正です'); return; }
  if (widthPx * heightPx > MAX_PIXELS) { alert('出力が大きすぎます。サイズまたはDPIを下げてください'); return; }
  const list = state.images.filter(a => a && a.source); if (list.length === 0) { alert('画像を追加してください'); return; }

  const exportCanvas = document.createElement('canvas'); exportCanvas.width = widthPx; exportCanvas.height = heightPx;
  const ctx = exportCanvas.getContext('2d'); drawPattern(exportCanvas, ctx, list);

  let blob = await new Promise((res) => exportCanvas.toBlob(res, 'image/png'));
  if (!blob) { const dataUrl = exportCanvas.toDataURL('image/png'); blob = dataURLtoBlob(dataUrl); }
  const patched = await writePngDpi(blob, dpi).catch(() => blob);
  const filename = `pattern_${widthPx}x${heightPx}_${dpi}dpi.png`;
  const url = URL.createObjectURL(patched); triggerDownload(url, filename); setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
}

function triggerDownload(url, filename) { const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

// PNG DPI (pHYs) writer
async function writePngDpi(pngBlob, dpi) {
  const buf = await pngBlob.arrayBuffer(); const u8 = new Uint8Array(buf);
  const sig = [137,80,78,71,13,10,26,10]; for (let i = 0; i < 8; i++) if (u8[i] !== sig[i]) throw new Error('Invalid PNG');
  let pHYsIndex = -1; let insertAfter = 8; let i = 8;
  while (i < u8.length) { const len = readUint32(u8, i); const type = readType(u8, i + 4); if (type === 'IHDR') insertAfter = i + 12 + len; if (type === 'pHYs') { pHYsIndex = i; break; } i += 12 + len; }
  const ppm = Math.round(dpi * 39.37007874); const pHYsData = new Uint8Array(9); writeUint32(pHYsData, 0, ppm); writeUint32(pHYsData, 4, ppm); pHYsData[8] = 1;
  const pHYsChunk = makeChunk('pHYs', pHYsData);
  let out;
  if (pHYsIndex >= 0) { const len = readUint32(u8, pHYsIndex); const before = u8.slice(0, pHYsIndex); const after = u8.slice(pHYsIndex + 12 + len); out = concat(before, pHYsChunk, after); }
  else { const before = u8.slice(0, insertAfter); const after = u8.slice(insertAfter); out = concat(before, pHYsChunk, after); }
  return new Blob([out], { type: 'image/png' });
}
function readUint32(u8, off) { return (u8[off] << 24) | (u8[off+1] << 16) | (u8[off+2] << 8) | (u8[off+3]); }
function writeUint32(u8, off, val) { u8[off] = (val >>> 24) & 0xff; u8[off+1] = (val >>> 16) & 0xff; u8[off+2] = (val >>> 8) & 0xff; u8[off+3] = (val) & 0xff; }
function readType(u8, off) { return String.fromCharCode(u8[off], u8[off+1], u8[off+2], u8[off+3]); }
function makeChunk(typeStr, data) { const type = new Uint8Array(typeStr.split('').map(c => c.charCodeAt(0))); const len = data.length; const out = new Uint8Array(12 + len); writeUint32(out, 0, len); out.set(type, 4); out.set(data, 8); const crc = crc32(concat(type, data)); writeUint32(out, 8 + len, crc >>> 0); return out; }
function concat(...arrs) { const size = arrs.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(size); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; }
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; } return table; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dataURLtoBlob(dataUrl) { const parts = dataUrl.split(','); const mime = parts[0].match(/:(.*?);/)[1] || 'image/png'; const bstr = atob(parts[1]); const n = bstr.length; const u8 = new Uint8Array(n); for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i); return new Blob([u8], { type: mime }); }

// 背景とパターンを合成して保存（透過パターン → 背景合成）
async function exportComposite() {
  const { width, height, unit, dpi } = state.export;
  const widthPx = toPx(width, unit, dpi); const heightPx = toPx(height, unit, dpi);
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) { alert('出力サイズが不正です'); return; }
  if (widthPx * heightPx > MAX_PIXELS) { alert('出力が大きすぎます。サイズまたはDPIを下げてください'); return; }
  const list = state.images.filter(a => a && a.source); if (list.length === 0) { alert('画像を追加してください'); return; }

  // 1) 透過のパターンレイヤーを作成
  const patternCanvas = document.createElement('canvas'); patternCanvas.width = widthPx; patternCanvas.height = heightPx;
  const pctx = patternCanvas.getContext('2d');
  drawPattern(patternCanvas, pctx, list);

  // 2) 合成キャンバス
  const outCanvas = document.createElement('canvas'); outCanvas.width = widthPx; outCanvas.height = heightPx;
  const ctx = outCanvas.getContext('2d');

  // 背景設定の読み取り（assets/js/bgSettings.js と互換のキー）
  let bgType = 'none'; let bgSrc = null;
  try { const ds = document.body?.dataset || {}; if (ds.bgSetting) bgType = ds.bgSetting; if (ds.bgImageSrc) bgSrc = ds.bgImageSrc; } catch {}
  try { if (!bgType || bgType === 'none') { const s = localStorage.getItem('bgSetting'); if (s) bgType = s; } if (!bgSrc) bgSrc = localStorage.getItem('bgImageSrc'); } catch {}

  const letterbox = (bgType === 'black') ? '#000000' : '#ffffff';
  if (bgType === 'white' || bgType === 'black') {
    ctx.fillStyle = letterbox; ctx.fillRect(0, 0, widthPx, heightPx);
  } else if (bgType === 'image' && bgSrc) {
    await new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        try {
          ctx.fillStyle = letterbox; ctx.fillRect(0, 0, widthPx, heightPx);
          const ratio = im.naturalWidth / im.naturalHeight; const dh = heightPx; const dw = dh * ratio; const dx = Math.round((widthPx - dw) / 2);
          ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, dx, 0, Math.round(dw), dh);
        } catch {}
        resolve();
      };
      im.onerror = () => resolve();
      try { const a = document.createElement('a'); a.href = bgSrc; im.src = a.href; } catch { im.src = bgSrc; }
    });
  }

  // 背景パターン設定（patternSettings.js）を合成（中間レイヤー）
  try {
    let patSrc = null; let scalePct = 100, offX = 0, offY = 0;
    try { patSrc = document.body?.dataset?.patternImageSrc || null; } catch {}
    if (!patSrc) { try { patSrc = localStorage.getItem('patternImageSrc'); } catch {} }
    try {
      const ds = document.body?.dataset || {};
      if (ds.patternScalePct) scalePct = parseFloat(ds.patternScalePct) || scalePct;
      if (ds.patternOffsetX) offX = parseFloat(ds.patternOffsetX) || offX;
      if (ds.patternOffsetY) offY = parseFloat(ds.patternOffsetY) || offY;
    } catch {}
    try {
      const s = localStorage.getItem('patternScalePct');
      const sx = localStorage.getItem('patternOffsetX');
      const sy = localStorage.getItem('patternOffsetY');
      if (s !== null) scalePct = parseFloat(s) || scalePct;
      if (sx !== null) offX = parseFloat(sx) || offX;
      if (sy !== null) offY = parseFloat(sy) || offY;
    } catch {}
    scalePct = Math.max(50, Math.min(150, scalePct));
    if (patSrc) {
      await new Promise((resolve) => {
        const im = new Image();
        im.onload = () => {
          try {
            const ratio = im.naturalWidth / im.naturalHeight;
            const dh = Math.round(heightPx * (scalePct / 100));
            const dw = Math.round(dh * ratio);
            const dx = Math.round((widthPx - dw) / 2 + offX);
            const dy = Math.round((heightPx - dh) / 2 + offY);
            ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch {}
            ctx.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, dx, dy, dw, dh);
          } catch {}
          resolve();
        };
        im.onerror = () => resolve();
        try { const a = document.createElement('a'); a.href = patSrc; im.src = a.href; } catch { im.src = patSrc; }
      });
    }
  } catch {}

  // パターン（透過）を上に合成
  ctx.drawImage(patternCanvas, 0, 0);

  let blob = await new Promise((res) => outCanvas.toBlob(res, 'image/png'));
  if (!blob) { const dataUrl = outCanvas.toDataURL('image/png'); blob = dataURLtoBlob(dataUrl); }
  const patched = await writePngDpi(blob, dpi).catch(() => blob);
  const filename = `pattern_composite_${widthPx}x${heightPx}_${dpi}dpi.png`;
  const url = URL.createObjectURL(patched); triggerDownload(url, filename); setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
}

function updatePreviewSize(force = false) {
  const c = el('preview'); const { width, height, unit, dpi } = state.export;
  const widthPx = toPx(width || 0, unit, dpi); const heightPx = toPx(height || 0, unit, dpi);
  let targetW = 1024, targetH = 768;
  if (widthPx > 0 && heightPx > 0) { const maxW = 1024, maxH = 768; const s = Math.min(maxW / widthPx, maxH / heightPx); targetW = Math.max(200, Math.floor(widthPx * s)); targetH = Math.max(200, Math.floor(heightPx * s)); }
  if (force || c.width !== targetW || c.height !== targetH) { c.width = targetW; c.height = targetH; }
}

function applyPresetVisibility() {
  const bar = el('presetToolbar'); const btn = el('togglePresetBtn'); if (!bar) return;
  if (state.presetVisible) { bar.style.display = ''; if (btn) btn.textContent = 'プリセットを隠す'; }
  else { bar.style.display = 'none'; if (btn) btn.textContent = 'プリセットを表示'; }
}

// init
if (!window.__GPT5_INIT__) {
  window.__GPT5_INIT__ = true;
  try { console.info('[GPT5PatternTool] version', APP_VERSION); } catch {}
  state.customPresets = loadCustomPresets(); refreshPresetSelect();
  setupThemeToggle(); setupInputs();
  window.addEventListener('message', (e) => {
    const msg = e?.data; if (!msg || msg.type !== 'customLayoutSaved') return;
    try {
      const payload = msg.payload || {}; const rep = payload.repeat || {}; const map = Array.isArray(payload.map) ? payload.map : [];
      state.custom.enabled = true; state.custom.repeat = { cols: clampInt(rep.cols, 1, 100, 2), rows: clampInt(rep.rows, 1, 100, 2) }; state.custom.map = map.slice();
      const useCustom = el('useCustomLayout'); if (useCustom) useCustom.checked = true; render();
    } catch (err) { console.error('Failed to apply custom layout', err); }
  });
  try { const pv = localStorage.getItem('gpt5_preset_visible'); if (pv !== null) state.presetVisible = pv === 'true'; } catch {}
  updatePreviewSize(true); render(); syncScaleControls(); updateControlVisibility(); updateDeletePresetState(); applyPresetVisibility();
}
