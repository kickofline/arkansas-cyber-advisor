async function renderChat(router, chatId, scenarioPrompt = null) {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <span class="chat-title" id="chat-title"></span>
      </div>
      <div class="messages" id="messages"></div>
    </div>
    <div class="input-wrap">
      <div class="input-card">
        <textarea id="msg-input" rows="1" placeholder="Reply…"></textarea>
        <div class="input-card-footer">
          <button class="input-add-btn" title="Attach">+</button>
          <div class="input-card-right">
            <span class="model-label">Cyber Advisor</span>
            <button class="send-btn" id="send-btn" title="Send">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="14" x2="8" y2="2"/><polyline points="3 7 8 2 13 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="input-disclaimer">Cyber Advisor can make mistakes. Always verify important security information.</div>
    </div>
  `;

  const messagesEl  = document.getElementById('messages');
  const inputEl     = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');
  const titleEl     = document.getElementById('chat-title');

  // Load history
  let history = [];
  let chatTitle = '';
  if (chatId) {
    if (State.user) {
      const { data, ok } = await API.getChat(chatId);
      if (ok) {
        history   = data.messages || [];
        chatTitle = data.chat?.title || '';
      }
    } else {
      const chat = LocalChats.get(chatId);
      if (chat) { history = chat.messages || []; chatTitle = chat.title || ''; }
    }
  }

  if (titleEl) titleEl.textContent = chatTitle || 'New conversation';
  history.forEach(m => appendMessage(messagesEl, m.role, m.content));
  scrollToBottom(messagesEl);

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || State.streaming) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    State.streaming = true;

    // Ensure chat exists
    let activeChatId = chatId;
    if (!activeChatId) {
      const title = text.split(' ').slice(0, 6).join(' ');
      if (State.user) {
        const { data } = await API.createChat(title);
        activeChatId = data.id;
        chatId = activeChatId;
        if (titleEl) titleEl.textContent = title;
        router.navigate(`/chat/${activeChatId}`);
      } else {
        const chat = LocalChats.create(title);
        activeChatId = chat.id;
        chatId = activeChatId;
        if (titleEl) titleEl.textContent = title;
        router.navigate(`/chat/${activeChatId}`);
      }
      refreshChatList(router, activeChatId);
    }

    // Save user message
    if (State.user) {
      await API.addMessage(activeChatId, 'user', text);
    } else {
      LocalChats.addMessage(activeChatId, 'user', text);
    }

    appendMessage(messagesEl, 'user', text);
    history.push({ role: 'user', content: text });

    // Typing indicator (asterisk)
    const typingEl = appendTyping(messagesEl);
    scrollToBottom(messagesEl);

    // Replace typing with streaming message
    const { bubble, thinkingEl, mainEl } = appendStreamingMessage(messagesEl, typingEl);
    scrollToBottom(messagesEl);

    let fullContent = '';

    try {
      const res = await fetch('/api/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chat_id: State.user ? activeChatId : null,
          history: history.slice(0, -1),
          scenario_prompt: scenarioPrompt,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          if (payload.startsWith('[ERROR]')) {
            showStreamError(bubble, payload.slice(7).trim() || 'Could not reach the AI.', () => {
              history.pop();
              State.streaming = false;
              sendBtn.disabled = false;
              inputEl.value = text;
              sendMessage();
            });
            break;
          }
          try {
            const { token } = JSON.parse(payload);
            fullContent += token;
            const processed = processThinkTags(fullContent);
            if (processed.thinking) {
              thinkingEl.textContent = processed.thinking;
              const toggle = thinkingEl.closest('.reasoning-block')?.querySelector('.reasoning-toggle');
              if (toggle) toggle.style.display = 'inline-flex';
            }
            mainEl.innerHTML = marked.parse(processed.main || '');
          } catch {}
        }
        scrollToBottom(messagesEl);
      }
    } catch {
      showStreamError(bubble, 'Could not reach the AI. Please try again.', () => {
        history.pop();
        State.streaming = false;
        sendBtn.disabled = false;
        inputEl.value = text;
        sendMessage();
      });
    }

    if (!State.user && fullContent) LocalChats.addMessage(activeChatId, 'assistant', fullContent);
    if (fullContent) history.push({ role: 'assistant', content: fullContent });

    State.streaming = false;
    sendBtn.disabled = false;
    scenarioPrompt = null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function processThinkTags(raw) {
  const m = raw.match(/^<think>([\s\S]*?)(<\/think>|$)/);
  if (!m) return { thinking: '', main: raw };
  return { thinking: m[1], main: raw.slice(m[0].length) };
}

function appendMessage(container, role, content) {
  const wrap   = document.createElement('div');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (role === 'assistant') {
    const processed = processThinkTags(content);
    if (processed.thinking) bubble.appendChild(makeThinkBlock(processed.thinking));
    const mainEl = document.createElement('div');
    mainEl.innerHTML = marked.parse(processed.main || '');
    bubble.appendChild(mainEl);
  } else {
    bubble.textContent = content;
  }

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  return bubble;
}

function appendStreamingMessage(container, typingEl) {
  typingEl.remove();
  const wrap   = document.createElement('div');
  wrap.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  // Reasoning block (hidden until thinking content arrives)
  const reasoningBlock = document.createElement('div');
  reasoningBlock.className = 'reasoning-block';
  const toggleEl = document.createElement('div');
  toggleEl.className = 'reasoning-toggle';
  toggleEl.style.display = 'none';
  toggleEl.textContent = '▶ Show reasoning';
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'reasoning-content';

  toggleEl.addEventListener('click', () => {
    const open = thinkingEl.classList.toggle('open');
    toggleEl.textContent = open ? '▼ Hide reasoning' : '▶ Show reasoning';
  });

  reasoningBlock.appendChild(toggleEl);
  reasoningBlock.appendChild(thinkingEl);
  bubble.appendChild(reasoningBlock);

  const mainEl = document.createElement('div');
  bubble.appendChild(mainEl);
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  return { bubble, thinkingEl, mainEl };
}

function makeThinkBlock(thinkText) {
  const wrap    = document.createElement('div');
  const toggle  = document.createElement('div');
  toggle.className = 'reasoning-toggle';
  toggle.textContent = '▶ Show reasoning';
  const content = document.createElement('div');
  content.className = 'reasoning-content';
  content.textContent = thinkText;
  toggle.addEventListener('click', () => {
    const open = content.classList.toggle('open');
    toggle.textContent = open ? '▼ Hide reasoning' : '▶ Show reasoning';
  });
  wrap.appendChild(toggle);
  wrap.appendChild(content);
  return wrap;
}

function appendTyping(container) {
  const wrap   = document.createElement('div');
  wrap.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<span class="typing-asterisk">✳</span>';
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  return wrap;
}

function showStreamError(bubble, msg, retryFn) {
  const err = document.createElement('div');
  err.className = 'msg-error';
  err.innerHTML = `⚠ ${escHtml(msg)} <button>Retry</button>`;
  err.querySelector('button').addEventListener('click', retryFn);
  bubble.appendChild(err);
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}
