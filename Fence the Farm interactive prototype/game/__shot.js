(function () {
  const go = () => {
    const G = window.game;
    if (!G || !G.el) { setTimeout(go, 20); return; }
    G.options.audio = false; G.options.music = false;
    if (G.el.debug) G.el.debug.style.display = 'none';
    setTimeout(() => {
      const s = document.createElement('style');
      s.textContent = '#ftf-stage *, #ftf-stage { transition: none !important; animation: none !important; }';
      document.head.appendChild(s);
      const r = G.el.logo.getBoundingClientRect(), st = G.root.getBoundingClientRect();
      const k = st.width / 1280;
      const d = document.createElement('pre');
      d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:6px;background:rgba(0,0,0,.9);color:#8f8;font:600 11px monospace';
      d.textContent = 'logo stage-px  y ' + Math.round((r.top-st.top)/k) + '..' + Math.round((r.bottom-st.top)/k) +
        '   w ' + Math.round(r.width/k) + '  h ' + Math.round(r.height/k);
      document.body.appendChild(d);
    }, 500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
