class Router {
  constructor() {
    this._routes = [];
    this._suppress = false;
    window.addEventListener('hashchange', () => {
      if (this._suppress) { this._suppress = false; return; }
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
    this._suppress = true;
    window.history.replaceState(null, '', hash);
  }
}
