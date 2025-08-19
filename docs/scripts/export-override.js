// Override export to honor exact size and DPI from inputs
(function(){
  function numVal(id){
    const el = document.getElementById(id);
    if (!el) return null;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : null;
    }

  function computeTarget(){
    let w = numVal('width');
    let h = numVal('height');
    let dpi = numVal('dpi') || 300;
    const unitEl = document.getElementById('unit');
    const unit = unitEl ? String(unitEl.value).toLowerCase() : 'px';
    if (unit === 'mm') {
      const mmToPx = (mm)=> Math.round((parseFloat(mm)||0) / 25.4 * dpi);
      if (w) w = mmToPx(w);
      if (h) h = mmToPx(h);
    }
    const src = document.getElementById('preview');
    const cw = src ? src.width : 0;
    const ch = src ? src.height : 0;
    if (!w && cw) w = cw;
    if (!h && ch) h = ch;
    if (w && !h && cw && ch) h = Math.round(ch * (w / cw));
    if (h && !w && cw && ch) w = Math.round(cw * (h / ch));
    w = Math.max(1, Math.floor(w || 1024));
    h = Math.max(1, Math.floor(h || 768));
    // Cap total pixels to avoid OOM
    try {
      const maxPx = (window.MAX_PIXELS && Number.isFinite(window.MAX_PIXELS)) ? window.MAX_PIXELS : 50_000_000;
      const total = w * h;
      if (total > maxPx) {
        const scale = Math.sqrt(maxPx / total);
        w = Math.max(1, Math.floor(w * scale));
        h = Math.max(1, Math.floor(h * scale));
      }
    } catch {}
    return { w, h, dpi };
  }

  function injectDPI(dataURL, dpi){
    if (!dpi || !/^data:image\/png;base64,/.test(dataURL)) return dataURL;
    try {
      const b64 = dataURL.split(',')[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      const sig = [137,80,78,71,13,10,26,10];
      for (let i=0;i<8;i++) if (bytes[i]!==sig[i]) return dataURL;
      const u32 = (p)=> (bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3];
      const wU32 = (arr,off,val)=>{ arr[off]=(val>>>24)&255; arr[off+1]=(val>>>16)&255; arr[off+2]=(val>>>8)&255; arr[off+3]=val&255; };
      let pos = 8, ihdrEnd=-1, firstIDAT=-1, pHYsPos=-1, pHYsLen=0;
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
      wU32(pHYsData,0,ppm); wU32(pHYsData,4,ppm); pHYsData[8]=1;
      const typeArr = new Uint8Array([112,72,89,115]);
      const crcTable = (function(){ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c; } return t; })();
      const crc = (payload)=>{ let c=~0; for(let i=0;i<payload.length;i++) c = crcTable[(c^payload[i])&255] ^ (c>>>8); return (~c)>>>0; };
      const lenArr = new Uint8Array(4); wU32(lenArr,0,9);
      const crcPayload = new Uint8Array(4 + 9); crcPayload.set(typeArr,0); crcPayload.set(pHYsData,4);
      const crcVal = crc(crcPayload);
      const crcArr = new Uint8Array(4); wU32(crcArr,0,crcVal);
      let out;
      if (pHYsPos >= 0 && pHYsLen === 9) {
        const outBytes = bytes.slice();
        outBytes.set(pHYsData, pHYsPos + 8);
        outBytes.set(crcArr, pHYsPos + 8 + 9);
        out = outBytes;
      } else {
        const insertAt = (firstIDAT>=0 ? firstIDAT : ihdrEnd);
        const before = bytes.slice(0, insertAt);
        const after = bytes.slice(insertAt);
        out = new Uint8Array(before.length + 4 + 4 + 9 + 4 + after.length);
        let o=0; out.set(before,o); o+=before.length; out.set(lenArr,o); o+=4; out.set(typeArr,o); o+=4; out.set(pHYsData,o); o+=9; out.set(crcArr,o); o+=4; out.set(after,o);
      }
      let s=''; for (let i=0;i<out.length;i++) s+=String.fromCharCode(out[i]);
      return 'data:image/png;base64,' + btoa(s);
    } catch { return dataURL; }
  }

  async function exportPng(){
    const src = document.getElementById('preview');
    if (!src) { alert('プレビューキャンバスが見つかりません'); return; }
    const { w, h, dpi } = computeTarget();
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) { alert('Canvasコンテキスト取得に失敗しました'); return; }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
    let url = out.toDataURL('image/png');
    url = injectDPI(url, dpi);
    const a = document.createElement('a');
    const ts = new Date();
    const pad = (n)=> String(n).padStart(2,'0');
    const fname = `pattern_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
    a.download = fname;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Override existing if present, and provide both names
  window.exportPng = exportPng;
  window.exportPNG = exportPng;
})();

