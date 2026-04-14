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
      </div>
      <div class="admin-body">
        <div class="admin-section" id="tab-system-prompt"></div>
        <div class="admin-section" id="tab-prompts" style="display:none"></div>
        <div class="admin-section" id="tab-documents" style="display:none"></div>
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
  ]);
}


// ── System Prompt ─────────────────────────────────────────────────────────────

async function renderSystemPromptTab(el) {
  const { data } = await API.adminGetSettings();
  const current = data?.system_prompt || '';
  el.innerHTML = `
    <div class="admin-card">
      <p class="admin-hint">This is the base instruction given to the AI on every conversation. Leave blank to use the built-in default.</p>
      <textarea id="admin-system-prompt" rows="12" placeholder="Leave blank to use default…" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2);resize:vertical">${escHtml(current)}</textarea>
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
    el.querySelector('#admin-system-prompt').value = '';
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
    el.innerHTML = `
      <div class="admin-card">
        <p class="admin-hint">These appear as quick-start buttons on the home page and chat. If none are saved, the built-in defaults are used.</p>
        <table class="admin-table">
          <thead><tr><th>Icon</th><th>Label</th><th>Prompt text</th><th>Active</th><th></th></tr></thead>
          <tbody>
            ${prompts.map(p => `
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
            `).join('')}
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
        <p class="admin-hint">Active documents are appended to the system prompt as reference material. Supports PDF and plain text / Markdown. Max 50 000 characters per file.</p>
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

    el.querySelector('#doc-upload').addEventListener('change', async e => {
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
