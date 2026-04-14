// ── Backend API (authenticated) ───────────────────────────────────────────────
const API = {
  async _req(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { data, status: res.status, ok: res.ok };
  },
  get:  (path)       => API._req('GET', path),
  post: (path, body) => API._req('POST', path, body),

  me:           ()              => API.get('/api/me'),
  login:        (email, pass)   => API.post('/login', { email, password: pass }),
  register:     (email, pass)   => API.post('/register', { email, password: pass }),
  logout:       ()              => API.post('/logout'),
  listChats:    ()              => API.get('/api/chats'),
  createChat:   (title)         => API.post('/api/chats', { title }),
  getChat:      (id)            => API.get(`/api/chats/${id}`),
  addMessage:   (chatId, role, content) => API.post(`/api/chats/${chatId}/messages`, { role, content }),
  renameChat:   (id, title)     => API._req('PATCH', `/api/chats/${id}`, { title }),
  generateTitle:(message)       => API.post('/api/title', { message }),
  migrate:      (chats)         => API.post('/api/migrate', { chats }),

  // Admin
  adminGetSettings:   ()           => API.get('/api/admin/settings'),
  adminSaveSettings:  (data)       => API.post('/api/admin/settings', data),
  adminListPrompts:   ()           => API.get('/api/admin/prompts'),
  adminSavePrompt:    (id, data)   => API._req('PUT', `/api/admin/prompts/${id}`, data),
  adminCreatePrompt:  (data)       => API.post('/api/admin/prompts', data),
  adminDeletePrompt:  (id)         => API._req('DELETE', `/api/admin/prompts/${id}`),
  adminGetAdmins:     ()           => API.get('/api/admin/admins'),
  adminSaveAdmins:    (emails)     => API.post('/api/admin/admins', { emails }),
  adminListDocs:      ()           => API.get('/api/admin/documents'),
  adminToggleDoc:     (id)         => API._req('PATCH', `/api/admin/documents/${id}`),
  adminDeleteDoc:     (id)         => API._req('DELETE', `/api/admin/documents/${id}`),
  adminUploadDoc:     (formData)   => fetch('/api/admin/documents', { method: 'POST', credentials: 'same-origin', body: formData }).then(r => r.json()),
};

// ── LocalChats: localStorage store for logged-out users ───────────────────────
const LocalChats = {
  _KEY: 'ark_cyber_chats',

  all() {
    try { return JSON.parse(localStorage.getItem(this._KEY) || '[]'); }
    catch { return []; }
  },

  _save(chats) { localStorage.setItem(this._KEY, JSON.stringify(chats)); },

  create(title) {
    const chat = { id: crypto.randomUUID(), title, messages: [], created_at: new Date().toISOString() };
    const all = this.all();
    all.unshift(chat);
    this._save(all);
    return chat;
  },

  get(id) { return this.all().find(c => c.id === id) || null; },

  addMessage(chatId, role, content) {
    const all = this.all();
    const chat = all.find(c => c.id === chatId);
    if (!chat) return;
    chat.messages.push({ role, content, created_at: new Date().toISOString() });
    this._save(all);
  },

  rename(id, title) {
    const all = this.all();
    const chat = all.find(c => c.id === id);
    if (chat) { chat.title = title; this._save(all); }
  },

  clear() { localStorage.removeItem(this._KEY); },
};

// ── App state ─────────────────────────────────────────────────────────────────
const State = {
  user: null,        // null = logged out, object = { id, email }
  streaming: false,  // true while waiting for Ollama

  async init() {
    const { data } = await API.me();
    this.user = (data && data.id) ? data : null;
  },
};
