async function renderSidebar(router, activeChatId = null) {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-header"><h1>Cyber Advisor</h1></div>
    <div class="sidebar-nav">
      <button class="btn btn-primary new-chat-btn" id="sb-new-chat">+ New Chat</button>
    </div>
    <div class="chat-list" id="sb-chat-list"><div style="padding:12px;color:var(--text-muted);font-size:13px">Loading…</div></div>
    <div class="sidebar-footer" id="sb-footer"></div>
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
    listEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">No chats yet</div>';
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
    footer.innerHTML = `
      <span style="font-size:12px">${escHtml(State.user.email)}</span>
      <br><a href="#" id="sb-logout">Sign out</a>
    `;
    footer.querySelector('#sb-logout').addEventListener('click', async e => {
      e.preventDefault();
      await API.logout();
      State.user = null;
      router.navigate('/');
    });
  } else {
    footer.innerHTML = `<a href="#/login">Sign in</a> · <a href="#/register">Create account</a>`;
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
