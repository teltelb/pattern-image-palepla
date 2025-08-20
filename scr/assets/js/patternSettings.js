// Pattern settings: button, selector, and render as CSS background layer on the canvas (behind drawn images)
(function(){
  function getPreview(){ return document.getElementById('preview') || document.querySelector('canvas#preview, #mainCanvas, canvas'); }

  function getPatternState(){
    try{ const ds=document.body?.dataset?.patternImageSrc; if(ds) return {src:ds}; }catch{}
    try{ const s=localStorage.getItem('patternImageSrc'); if(s) return {src:s}; }catch{}
    return { src:null };
  }

  function getPatternTransform(){
    let scalePct=100, xPx=0, yPx=0;
    try{ const ds=document.body?.dataset; if(ds?.patternScalePct) scalePct=parseFloat(ds.patternScalePct)||scalePct; if(ds?.patternOffsetX) xPx=parseFloat(ds.patternOffsetX)||xPx; if(ds?.patternOffsetY) yPx=parseFloat(ds.patternOffsetY)||yPx; }catch{}
    try{ const s=localStorage.getItem('patternScalePct'); const sx=localStorage.getItem('patternOffsetX'); const sy=localStorage.getItem('patternOffsetY'); if(s!==null) scalePct=parseFloat(s)||scalePct; if(sx!==null) xPx=parseFloat(sx)||xPx; if(sy!==null) yPx=parseFloat(sy)||yPx; }catch{}
    scalePct=Math.max(100, Math.min(150, scalePct));
    return { scalePct, xPx, yPx };
  }

  function rememberPattern(src){
    try{ if(src) document.body.dataset.patternImageSrc=src; else delete document.body.dataset.patternImageSrc; }catch{}
    try{ if(src) localStorage.setItem('patternImageSrc', src); else localStorage.removeItem('patternImageSrc'); }catch{}
  }

  function applyCssLayers(previewEl, patternSrc){
    if(!previewEl) return;
    const tf=getPatternTransform();
    const s=Math.max(1,(tf.scalePct||100)/100);
    const x=tf.xPx||0, y=tf.yPx||0;

    const baseImg = previewEl.dataset.bgBaseImage || '';
    const baseRep = previewEl.dataset.bgBaseRepeat || '';
    const basePos = previewEl.dataset.bgBasePosition || '';
    const baseSize = previewEl.dataset.bgBaseSize || '';
    const baseColor = previewEl.dataset.bgBaseColor || '';

    const images=[]; const repeats=[]; const positions=[]; const sizes=[];
    if(patternSrc){
      images.push(`url('${patternSrc}')`);
      repeats.push('no-repeat');
      positions.push(`calc(50% + ${x}px) calc(50% + ${y}px)`);
      sizes.push(`auto ${Math.round(100*s)}%`); // height basis
    }
    if(baseImg){
      images.push(baseImg);
      repeats.push(baseRep || 'no-repeat');
      positions.push(basePos || 'center');
      sizes.push(baseSize || 'auto 100%');
    }
    previewEl.style.backgroundImage = images.join(', ');
    previewEl.style.backgroundRepeat = repeats.join(', ');
    previewEl.style.backgroundPosition = positions.join(', ');
    previewEl.style.backgroundSize = sizes.join(', ');
    if(baseColor) previewEl.style.backgroundColor = baseColor;
  }

  function insertPatternButton(){
    if(document.getElementById('openPatternSettingBtn')) return;
    let anchor = document.getElementById('openBgSettingBtn');
    if(!anchor){ const btns=Array.from(document.querySelectorAll('button,[role="button"],a')); anchor = btns.find(b=> (b.textContent||'').includes('背景設定')) || btns[0]; }
    if(!anchor) return;
    const btn=document.createElement('button'); btn.id='openPatternSettingBtn'; btn.type='button'; btn.textContent='パターン設定';
    try{ if(anchor.className) btn.className=anchor.className; }catch{}
    btn.style.marginLeft='8px';
    if(anchor.parentNode){ if(anchor.nextSibling) anchor.parentNode.insertBefore(btn, anchor.nextSibling); else anchor.parentNode.appendChild(btn); } else { document.body.appendChild(btn); }
    btn.addEventListener('click',()=>{ const cur=getPatternState(); const url = cur.src? `patternSelector.html?img=${encodeURIComponent(cur.src)}` : 'patternSelector.html'; window.open(url,'patternSettingWin','width=760,height=560'); });
  }

  function init(){
    // Clean up any legacy overlays
    try{ document.querySelectorAll('#patternOverlay,#patternOverlayWrap,#patternOverlayPane').forEach(el=>{ try{ el.remove(); }catch{} }); }catch{}
    insertPatternButton();
    const pv=getPreview(); const ps=getPatternState(); applyCssLayers(pv, ps.src);
    window.addEventListener('message',(e)=>{ const d=e&&e.data; if(!d) return; if(d.type==='patternSettingApply'){ rememberPattern(d.src||null); applyCssLayers(getPreview(), d.src||null); } if(d.type==='patternParamsChanged'){ const s=getPatternState(); applyCssLayers(getPreview(), s.src); } });
    try{ if(!window.__patternControlsInjected){ const sc=document.createElement('script'); sc.src='assets/js/patternControls.js'; sc.defer=true; document.body.appendChild(sc); window.__patternControlsInjected=true; } if(!window.__exportPngInjected){ const se=document.createElement('script'); se.src='assets/js/exportPng.js'; se.defer=true; document.body.appendChild(se); window.__exportPngInjected=true; } }catch{}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
