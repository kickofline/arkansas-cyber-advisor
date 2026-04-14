const _DEFAULT_SYSTEM_PROMPT = 'You are a friendly, plain-language cybersecurity advisor for Arkansas residents. Your audience includes parents, students, small business owners, and non-technical users. Give practical, actionable advice. Avoid jargon. If someone may be in immediate danger (e.g., active account compromise), tell them what to do first.';

async function renderAdmin(router) {
  if (!State.user?.is_admin) {
    router.navigate('/');
    return;
  }

  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-header">
        <h2>Admin Panel</h2>
      </div>
      <div class="admin-tabs">
        <button class="admin-tab active" data-tab="system-prompt">System Prompt</button>
        <button class="admin-tab" data-tab="prompts">Suggested Questions</button>
        <button class="admin-tab" data-tab="documents">Documents</button>
        <button class="admin-tab" data-tab="admins">Admins</button>
      </div>
      <div class="admin-body">
        <div class="admin-section" id="tab-system-prompt"></div>
        <div class="admin-section" id="tab-prompts" style="display:none"></div>
        <div class="admin-section" id="tab-documents" style="display:none"></div>
        <div class="admin-section" id="tab-admins" style="display:none"></div>
      </div>
    </div>
  `;

  main.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      main.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      main.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
      btn.classList.add('active');
      main.querySelector(`#tab-${btn.dataset.tab}`).style.display = '';
    });
  });

  await Promise.all([
    renderSystemPromptTab(main.querySelector('#tab-system-prompt')),
    renderPromptsTab(main.querySelector('#tab-prompts')),
    renderDocumentsTab(main.querySelector('#tab-documents')),
    renderAdminsTab(main.querySelector('#tab-admins')),
  ]);
}


// ── System Prompt ─────────────────────────────────────────────────────────────

async function renderSystemPromptTab(el) {
  const { data } = await API.adminGetSettings();
  const saved = data?.system_prompt || '';
  const isDefault = !saved;
  el.innerHTML = `
    <div class="admin-card">
      <p class="admin-hint">This is the base instruction given to the AI on every conversation. Clear and save to revert to the built-in default.</p>
      ${isDefault ? '<p style="font-size:12px;color:var(--text-muted);margin:0 0 8px;padding:6px 10px;background:var(--bg-3);border-radius:6px">Showing built-in default — edit and save to override.</p>' : ''}
      <textarea id="admin-system-prompt" rows="12" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);resize:vertical">${escHtml(saved || _DEFAULT_SYSTEM_PROMPT)}</textarea>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="admin-btn-primary" id="admin-save-prompt">Save</button>
        <button class="admin-btn" id="admin-reset-prompt">Reset to default</button>
        <span id="admin-prompt-status" style="font-size:13px;color:var(--text-muted)"></span>
      </div>
    </div>
  `;

  el.querySelector('#admin-save-prompt').addEventListener('click', async () => {
    const val = el.querySelector('#admin-system-prompt').value.trim();
    const { ok } = await API.adminSaveSettings({ system_prompt: val });
    el.querySelector('#admin-prompt-status').textContent = ok ? 'Saved.' : 'Error saving.';
    setTimeout(() => { el.querySelector('#admin-prompt-status').textContent = ''; }, 2000);
  });

  el.querySelector('#admin-reset-prompt').addEventListener('click', async () => {
    el.querySelector('#admin-system-prompt').value = _DEFAULT_SYSTEM_PROMPT;
    const { ok } = await API.adminSaveSettings({ system_prompt: '' });
    el.querySelector('#admin-prompt-status').textContent = ok ? 'Reset to default.' : 'Error.';
    setTimeout(() => { el.querySelector('#admin-prompt-status').textContent = ''; }, 2000);
  });
}


// ── Suggested Questions ───────────────────────────────────────────────────────

async function renderPromptsTab(el) {
  async function refresh() {
    const { data } = await API.adminListPrompts();
    const prompts = data || [];
    const usingDefaults = prompts.length === 0;
    el.innerHTML = `
      <div class="admin-card">
        <p class="admin-hint">These appear as quick-start buttons on the home page and chat. If none are saved, the built-in defaults are used.</p>
        ${usingDefaults ? '<p style="font-size:12px;color:var(--text-muted);margin:0 0 8px;padding:6px 10px;background:var(--bg-3);border-radius:6px">No custom prompts saved — showing built-in defaults (read-only). Add prompts below to override.</p>' : ''}
        <table class="admin-table">
          <thead><tr><th>Icon</th><th>Label</th><th>Prompt text</th><th>Active</th><th></th></tr></thead>
          <tbody>
            ${usingDefaults
              ? PROMPTS.map(p => `
                <tr style="opacity:0.6">
                  <td>${escHtml(p.icon)}</td>
                  <td>${escHtml(p.label)}</td>
                  <td>${escHtml(p.text)}</td>
                  <td>✓</td>
                  <td><em style="font-size:11px;color:var(--text-muted)">default</em></td>
                </tr>
              `).join('')
              : prompts.map(p => `
                <tr data-id="${p.id}">
                  <td><input class="admin-input" style="width:50px" value="${escHtml(p.icon)}" data-field="icon"></td>
                  <td><input class="admin-input" value="${escHtml(p.label)}" data-field="label"></td>
                  <td><input class="admin-input" style="width:100%" value="${escHtml(p.text)}" data-field="text"></td>
                  <td><input type="checkbox" ${p.active ? 'checked' : ''} data-field="active"></td>
                  <td>
                    <button class="admin-btn admin-save-row">Save</button>
                    <button class="admin-btn admin-delete-row">Delete</button>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
        <details style="margin-top:16px">
          <summary style="cursor:pointer;font-size:13px;color:var(--text-muted)">Add new prompt</summary>
          <div class="admin-add-form" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
            <input class="admin-input" id="new-icon" placeholder="Icon (emoji)" style="width:80px" value="🔒">
            <input class="admin-input" id="new-label" placeholder="Short label (e.g. I think I got hacked)">
            <textarea class="admin-input" id="new-text" rows="3" placeholder="Full prompt text sent to the AI…" style="resize:vertical"></textarea>
            <div><button class="admin-btn-primary" id="admin-add-prompt">Add</button></div>
          </div>
        </details>
      </div>
    `;

    el.querySelectorAll('.admin-save-row').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const id  = parseInt(row.dataset.id);
        const payload = {
          icon:     row.querySelector('[data-field=icon]').value,
          label:    row.querySelector('[data-field=label]').value,
          text:     row.querySelector('[data-field=text]').value,
          active:   row.querySelector('[data-field=active]').checked ? 1 : 0,
          position: 0,
        };
        await API.adminSavePrompt(id, payload);
        await refresh();
      });
    });

    el.querySelectorAll('.admin-delete-row').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.closest('tr').dataset.id);
        if (!confirm('Delete this prompt?')) return;
        await API.adminDeletePrompt(id);
        await refresh();
      });
    });

    el.querySelector('#admin-add-prompt')?.addEventListener('click', async () => {
      const icon  = el.querySelector('#new-icon').value.trim() || '🔒';
      const label = el.querySelector('#new-label').value.trim();
      const text  = el.querySelector('#new-text').value.trim();
      if (!label || !text) { alert('Label and prompt text are required.'); return; }
      await API.adminCreatePrompt({ icon, label, text, position: 0 });
      await refresh();
    });
  }

  await refresh();
}


// ── Documents ─────────────────────────────────────────────────────────────────

async function renderDocumentsTab(el) {
  async function refresh() {
    const { data } = await API.adminListDocs();
    const docs = data || [];
    el.innerHTML = `
      <div class="admin-card">
        <p class="admin-hint">Active documents are searched for relevant passages on each query and injected as context. Supports PDF and plain text / Markdown. Max 50 000 characters per file.</p>
        <table class="admin-table">
          <thead><tr><th>Filename</th><th>Uploaded</th><th>Active</th><th></th></tr></thead>
          <tbody>
            ${docs.map(d => `
              <tr data-id="${d.id}">
                <td>${escHtml(d.filename)}</td>
                <td style="white-space:nowrap;font-size:12px">${new Date(d.created_at).toLocaleDateString()}</td>
                <td><input type="checkbox" class="doc-active" ${d.active ? 'checked' : ''}></td>
                <td><button class="admin-btn admin-delete-doc">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top:16px">
          <label class="admin-btn-primary" style="cursor:pointer">
            Upload PDF or Markdown
            <input type="file" id="doc-upload" accept=".pdf,.md,.txt" style="display:none">
          </label>
          <span id="doc-upload-status" style="font-size:13px;color:var(--text-muted);margin-left:10px"></span>
        </div>
      </div>
    `;

    el.querySelectorAll('.doc-active').forEach(cb => {
      cb.addEventListener('change', async () => {
        const id = parseInt(cb.closest('tr').dataset.id);
        await API.adminToggleDoc(id);
      });
    });

    el.querySelectorAll('.admin-delete-doc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.closest('tr').dataset.id);
        if (!confirm('Delete this document?')) return;
        await API.adminDeleteDoc(id);
        await refresh();
      });
    });

    el.querySelector('#doc-upload')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const status = el.querySelector('#doc-upload-status');
      status.textContent = 'Uploading…';
      const fd = new FormData();
      fd.append('file', file);
      const result = await API.adminUploadDoc(fd);
      status.textContent = result.ok ? 'Uploaded.' : (result.error || 'Error.');
      setTimeout(() => { status.textContent = ''; }, 3000);
      if (result.ok) await refresh();
    });
  }

  await refresh();
}


// ── Admins ────────────────────────────────────────────────────────────────────

async function renderAdminsTab(el) {
  async function refresh() {
    const { data } = await API.adminGetAdmins();
    const envAdmins = data?.env_admins || [];
    const dbAdmins  = data?.db_admins  || [];

    el.innerHTML = `
      <div class="admin-card">
        <p class="admin-hint">Admins can access this panel. Emails set via the <code>ADMIN_EMAILS</code> environment variable are always active and cannot be removed here.</p>
        ${envAdmins.length ? `
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px;padding:6px 10px;background:var(--bg-3);border-radius:6px">
            Environment admins (read-only): ${envAdmins.map(e => `<strong>${escHtml(e)}</strong>`).join(', ')}
          </p>` : ''}
        <table class="admin-table" id="admins-table">
          <thead><tr><th>Email</th><th></th></tr></thead>
          <tbody>
            ${dbAdmins.map(email => `
              <tr data-email="${escHtml(email)}">
                <td>${escHtml(email)}</td>
                <td><button class="admin-btn admin-remove-admin">Remove</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top:16px;display:flex;gap:8px;align-items:center">
          <input class="admin-input" id="new-admin-email" placeholder="Email address" style="flex:1;max-width:300px">
          <button class="admin-btn-primary" id="admin-add-admin">Add</button>
          <span id="admin-admins-status" style="font-size:13px;color:var(--text-muted)"></span>
        </div>
      </div>
    `;

    async function saveList(emails) {
      const { ok } = await API.adminSaveAdmins(emails);
      const status = el.querySelector('#admin-admins-status');
      status.textContent = ok ? 'Saved.' : 'Error saving.';
      setTimeout(() => { status.textContent = ''; }, 2000);
      if (ok) await refresh();
    }

    el.querySelectorAll('.admin-remove-admin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.closest('tr').dataset.email;
        const updated = dbAdmins.filter(e => e !== email);
        await saveList(updated);
      });
    });

    el.querySelector('#admin-add-admin').addEventListener('click', async () => {
      const input = el.querySelector('#new-admin-email');
      const email = input.value.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        el.querySelector('#admin-admins-status').textContent = 'Enter a valid email.';
        setTimeout(() => { el.querySelector('#admin-admins-status').textContent = ''; }, 2000);
        return;
      }
      if (dbAdmins.includes(email)) {
        el.querySelector('#admin-admins-status').textContent = 'Already in list.';
        setTimeout(() => { el.querySelector('#admin-admins-status').textContent = ''; }, 2000);
        return;
      }
      await saveList([...dbAdmins, email]);
    });
  }

  await refresh();
}
