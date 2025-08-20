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

  function saveParams(scalePct, xPx, yPx) {
    try {
      document.body.dataset.patternScalePct = String(scalePct);
      document.body.dataset.patternOffsetX = String(xPx);
      document.body.dataset.patternOffsetY = String(yPx);
    } catch {}
    try {
      localStorage.setItem('patternScalePct', String(scalePct));
      localStorage.setItem('patternOffsetX', String(xPx));
      localStorage.setItem('patternOffsetY', String(yPx));
    } catch {}
  }

  function loadParams() {
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

  function insertControls(){
    if (document.getElementById('patternControls')) return;
    let anchor = document.getElementById('openPatternSettingBtn') || document.getElementById('openBgSettingBtn');
    if (!anchor) {
      const btns = Array.from(document.querySelectorAll('button, [role="button"], a'));
      anchor = btns.find(b => (b.textContent || '').includes('パターン設定')) || btns.find(b => (b.textContent || '').includes('背景設定')) || btns[0];
    }
    const panel = document.createElement('div');
    panel.id = 'patternControls';
    panel.style.display = 'grid';
    panel.style.gridTemplateColumns = 'auto 1fr auto auto';
    panel.style.gap = '8px';
    panel.style.alignItems = 'center';
    panel.style.marginTop = '8px';

    const mkRow = (labelText, rangeId, numId, min, max, step, suffix) => {
      const label = document.createElement('div');
      label.textContent = labelText;
      const range = document.createElement('input');
      range.type = 'range'; range.id = rangeId; range.min = String(min); range.max = String(max); range.step = String(step);
      range.style.width = '100%';
      const valueBox = document.createElement('input');
      valueBox.type = 'number'; valueBox.id = numId; valueBox.min = String(min); valueBox.max = String(max); valueBox.step = String(step);
      valueBox.style.width = '80px';
      const suf = document.createElement('div'); suf.textContent = suffix || '';
      return { label, range, valueBox, suf };
    };

    const rowX = mkRow('X(px)', 'patXRange', 'patXNum', -1000, 1000, 1, 'px');
    const rowY = mkRow('Y(px)', 'patYRange', 'patYNum', -1000, 1000, 1, 'px');
    const rowS = mkRow('拡縮率(%)', 'patSRange', 'patSNum', 100, 150, 1, '%');

    [rowX, rowY, rowS].forEach(r => {
      panel.appendChild(r.label);
      panel.appendChild(r.range);
      panel.appendChild(r.valueBox);
      panel.appendChild(r.suf);
    });

    // X/Y リセットボタン（X=0, Y=0）
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.id = 'patXYReset';
    resetBtn.textContent = '位置リセット (X/Y=0)';
    resetBtn.className = 'btn';
    resetBtn.style.gridColumn = '1 / -1';
    resetBtn.addEventListener('click', () => {
      rowX.range.value = '0';
      rowX.valueBox.value = '0';
      rowY.range.value = '0';
      rowY.valueBox.value = '0';
      // emit() は現在値を保存し、プレビューへ反映
      emit();
    });
    panel.appendChild(resetBtn);

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    } else {
      document.body.appendChild(panel);
    }

    const syncFromState = () => {
      const st = loadParams();
      rowX.range.value = String(st.xPx);
      rowX.valueBox.value = String(st.xPx);
      rowY.range.value = String(st.yPx);
      rowY.valueBox.value = String(st.yPx);
      rowS.range.value = String(st.scalePct);
      rowS.valueBox.value = String(st.scalePct);
      // Adjust range bounds to container size for better UX
      try {
        const c = getContainer();
        const cw = c ? c.clientWidth : 0;
        const ch = c ? c.clientHeight : 0;
        if (cw && ch) {
          const maxX = Math.max(50, Math.round(cw / 2));
          const maxY = Math.max(50, Math.round(ch / 2));
          rowX.range.min = rowX.valueBox.min = String(-maxX);
          rowX.range.max = rowX.valueBox.max = String(maxX);
          rowY.range.min = rowY.valueBox.min = String(-maxY);
          rowY.range.max = rowY.valueBox.max = String(maxY);
        }
      } catch {}
    };
    syncFromState();

    const emit = () => {
      const x = parseFloat(rowX.valueBox.value || '0') || 0;
      const y = parseFloat(rowY.valueBox.value || '0') || 0;
      const s = parseFloat(rowS.valueBox.value || '100') || 100;
      const ss = Math.max(100, Math.min(150, s));
      // clamp x,y to current slider bounds
      const xmin = parseFloat(rowX.range.min); const xmax = parseFloat(rowX.range.max);
      const ymin = parseFloat(rowY.range.min); const ymax = parseFloat(rowY.range.max);
      const xx = Math.max(xmin, Math.min(xmax, x));
      const yy = Math.max(ymin, Math.min(ymax, y));
      rowX.range.value = rowX.valueBox.value = String(xx);
      rowY.range.value = rowY.valueBox.value = String(yy);
      rowS.range.value = rowS.valueBox.value = String(ss);
      saveParams(ss, xx, yy);
      try { window.postMessage({ type: 'patternParamsChanged' }, '*'); } catch {}
    };

    const bind = (range, num) => {
      range.addEventListener('input', () => { num.value = range.value; emit(); });
      num.addEventListener('input', () => { range.value = num.value; emit(); });
    };
    bind(rowX.range, rowX.valueBox);
    bind(rowY.range, rowY.valueBox);
    bind(rowS.range, rowS.valueBox);
  }

  function init(){ insertControls(); window.addEventListener('resize', () => { try { insertControls(); } catch {} }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
