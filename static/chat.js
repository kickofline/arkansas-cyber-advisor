async function renderChat(router, chatId, scenarioPrompt = null) {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="chat-view">
      <div class="messages" id="messages"></div>
      <div class="input-area">
        <div class="input-row">
          <textarea id="msg-input" rows="1" placeholder="Ask a cybersecurity question…"></textarea>
          <button class="send-btn" id="send-btn" title="Send">&#9658;</button>
        </div>
      </div>
    </div>
  `;

  const messagesEl = document.getElementById('messages');
  const inputEl    = document.getElementById('msg-input');
  const sendBtn    = document.getElementById('send-btn');

  // Load history
  let history = [];
  if (chatId) {
    if (State.user) {
      const { data, ok } = await API.getChat(chatId);
      if (ok) history = data.messages || [];
    } else {
      const chat = LocalChats.get(chatId);
      if (chat) history = chat.messages || [];
    }
  }

  history.forEach(m => appendMessage(messagesEl, m.role, m.content));
  scrollToBottom(messagesEl);

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
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
        router.navigate(`/chat/${activeChatId}`);
      } else {
        const chat = LocalChats.create(title);
        activeChatId = chat.id;
        chatId = activeChatId;
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

    // Show typing indicator
    const typingEl = appendTyping(messagesEl);
    scrollToBottom(messagesEl);

    // Start streaming
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

      const reader = res.body.getReader();
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
              thinkingEl.closest('.reasoning-block')?.querySelector('.reasoning-toggle')?.style.setProperty('display', 'block');
            }
            mainEl.innerHTML = marked.parse(processed.main || '');
          } catch {}
        }
        scrollToBottom(messagesEl);
      }
    } catch (err) {
      showStreamError(bubble, 'Could not reach the AI. Please try again.', () => {
        history.pop();
        State.streaming = false;
        sendBtn.disabled = false;
        inputEl.value = text;
        sendMessage();
      });
    }

    if (!State.user && fullContent) {
      LocalChats.addMessage(activeChatId, 'assistant', fullContent);
    }
    if (fullContent) history.push({ role: 'assistant', content: fullContent });

    State.streaming = false;
    sendBtn.disabled = false;
    scenarioPrompt = null; // only use on first message
  }
}

function processThinkTags(raw) {
  const thinkMatch = raw.match(/^<think>([\s\S]*?)(<\/think>|$)/);
  if (!thinkMatch) return { thinking: '', main: raw };
  const thinking = thinkMatch[1];
  const rest = raw.slice(thinkMatch[0].length);
  return { thinking, main: rest };
}

function appendMessage(container, role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (role === 'assistant') {
    const processed = processThinkTags(content);
    if (processed.thinking) {
      bubble.appendChild(makeThinkBlock(processed.thinking));
    }
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
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const reasoningBlock = document.createElement('div');
  reasoningBlock.className = 'reasoning-block';
  const toggleEl = document.createElement('div');
  toggleEl.className = 'reasoning-toggle';
  toggleEl.textContent = '▶ Show reasoning';
  toggleEl.style.display = 'none';
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
  const wrap = document.createElement('div');
  const toggle = document.createElement('div');
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
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.innerHTML = '<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
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
