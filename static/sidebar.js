const APP_LOGO_SVG = `<svg class="app-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 3L5 6.5V12c0 4.2 3 8.2 7 9.5 4-1.3 7-5.3 7-9.5V6.5L12 3z" fill="currentColor"/>
  <path d="M9.5 12l1.8 1.8 3.2-3.2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function renderSidebar(router, activeChatId = null) {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sb-brand">
      <a href="#/" class="sb-brand-link">
        ${APP_LOGO_SVG}
        <span class="sb-brand-name">Arkansas Cyber Advisor</span>
      </a>
    </div>
    <nav class="sb-nav">
      <button class="sb-nav-btn" id="sb-new-chat">
        <span class="sb-nav-icon">+</span> New chat
      </button>
      ${State.user?.is_admin ? '<a href="#/admin" class="sb-nav-btn sb-admin-link">⚙ Admin</a>' : ''}
    </nav>
    <div class="sb-section">
      <div class="sb-section-label">Recents</div>
      <div class="chat-list" id="sb-chat-list">
        <div style="padding:6px 10px;color:var(--text-muted);font-size:13px">Loading…</div>
      </div>
    </div>
    <div class="sb-footer" id="sb-footer"></div>
  `;

  sidebar.querySelector('#sb-new-chat').addEventListener('click', () => {
    router.navigate('/chat');
  });

  await refreshChatList(router, activeChatId);
  renderFooter(router);
}

async function refreshChatList(router, activeChatId = null) {
  const listEl = document.getElementById('sb-chat-list');
  if (!listEl) return;

  let chats;
  if (State.user) {
    const { data, ok } = await API.listChats();
    chats = ok ? data : [];
  } else {
    chats = LocalChats.all();
  }

  if (chats.length === 0) {
    listEl.innerHTML = '<div style="padding:6px 10px;color:var(--text-muted);font-size:13px">No chats yet</div>';
    return;
  }

  listEl.innerHTML = chats.map(c => `
    <div class="chat-item${c.id === activeChatId ? ' active' : ''}" data-id="${c.id}">
      ${escHtml(c.title)}
    </div>
  `).join('');

  listEl.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => router.navigate(`/chat/${item.dataset.id}`));
  });
}

function renderFooter(router) {
  const footer = document.getElementById('sb-footer');
  if (!footer) return;

  if (State.user) {
    const initial = escHtml(State.user.email[0].toUpperCase());
    const email   = escHtml(State.user.email);
    footer.innerHTML = `
      <div class="sb-user" id="sb-user-row">
        <div class="sb-avatar">${initial}</div>
        <div class="sb-user-info">
          <div class="sb-user-name">${email}</div>
          <div class="sb-user-sub"><a href="#" id="sb-logout" style="color:var(--text-muted);text-decoration:none">Sign out</a></div>
        </div>
      </div>
    `;
    footer.querySelector('#sb-logout').addEventListener('click', async e => {
      e.preventDefault();
      await API.logout();
      window.location.reload();
    });
  } else {
    footer.innerHTML = `
      <div class="sb-footer-links">
        <a href="#/login">Sign in</a> &middot; <a href="#/register">Create account</a>
      </div>
    `;
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
