/* Fence the Farm — string dictionary harvested from data-i18n keys */
Object.assign(FenceTheFarm.prototype, {

  /* ---------------- localisation ----------------
     Every visible string is keyed with data-i18n. The markup carries the
     English source; initStrings() harvests it into a dictionary and
     window.ftfSetLocale(dict) swaps in any translation at runtime. */
  initStrings() {
    this.dict = {};
    this.root.querySelectorAll('[data-i18n]').forEach(n => { this.dict[n.getAttribute('data-i18n')] = n.textContent; });
    window.ftfStrings = this.dict;
    window.ftfSetLocale = d => {
      Object.keys(d || {}).forEach(k => { this.dict[k] = d[k]; });
      this.root.querySelectorAll('[data-i18n]').forEach(n => {
        const k = n.getAttribute('data-i18n');
        if (this.dict[k] != null) n.textContent = this.dict[k];
      });
      return this.dict;
    };
  },
  t(key) { return (this.dict && this.dict[key]) || key; }
});
