class Router {
  constructor() {
    this._routes = [];
    window.addEventListener('hashchange', (e) => {
      console.log('[router] hashchange old=', e.oldURL, 'new=', e.newURL);
      this._resolve();
    });
  }

  on(pattern, handler) {
    const keys = [];
    const src = pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    this._routes.push({ regex: new RegExp(`^${src}$`), keys, handler });
    return this;
  }

  start() {
    this._resolve();
    return this;
  }

  _resolve() {
    const path = window.location.hash.slice(1) || '/';
    console.log('[router] _resolve path=', path);
    for (const { regex, keys, handler } of this._routes) {
      const m = path.match(regex);
      if (m) {
        const params = {};
        keys.forEach((k, i) => { params[k] = m[i + 1]; });
        handler(params);
        return;
      }
    }
    window.location.hash = '/';
  }

  navigate(path) {
    window.location.hash = path;
  }

  silentReplace(hash) {
    console.log('[router] silentReplace', hash);
    window.history.replaceState(null, '', hash);
  }
}
