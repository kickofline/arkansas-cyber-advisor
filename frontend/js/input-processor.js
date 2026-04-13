import { appendBubble } from './chat-bubble-maker.js';
import { getActiveChatId, createNewChat, navigateToChat, refreshSidebar, init as initChats } from './chat-manager.js';

// ── Shared streaming logic ────────────────────────────────────────────────────

async function sendMessage(raw, chatId) {
    const conversation = document.getElementById('conversation');

    appendBubble(raw, false);

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message-wrapper';
    conversation.appendChild(wrapper);

    const thinkingBlock = document.createElement('details');
    thinkingBlock.className = 'thinking-block';
    thinkingBlock.open = true;
    const thinkingSummary = document.createElement('summary');
    thinkingSummary.textContent = 'Thinking...';
    const thinkingBody = document.createElement('div');
    thinkingBody.className = 'thinking-body';
    thinkingBlock.appendChild(thinkingSummary);
    thinkingBlock.appendChild(thinkingBody);

    const aiBubble = document.createElement('p');
    aiBubble.className = 'chatBubble ai';
    wrapper.appendChild(aiBubble);

    let fullText = '';
    let fullThinking = '';
    let thinkingVisible = false;
    let thinkingDone = false;

    try {
        const response = await fetch('/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: raw, chat_id: chatId })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                const event = JSON.parse(line);
                if (event.done) {
                    if (thinkingVisible) {
                        thinkingBlock.open = false;
                        thinkingSummary.textContent = 'Reasoned';
                    }
                    await refreshSidebar();
                } else if (event.thinking) {
                    if (!thinkingVisible) {
                        thinkingVisible = true;
                        wrapper.insertBefore(thinkingBlock, aiBubble);
                    }
                    fullThinking += event.thinking;
                    thinkingBody.textContent = fullThinking;
                } else if (event.text) {
                    if (thinkingVisible && !thinkingDone) {
                        thinkingDone = true;
                        thinkingBlock.open = false;
                        thinkingSummary.textContent = 'Reasoned';
                    }
                    fullText += event.text;
                    aiBubble.innerHTML = marked.parse(fullText);
                } else if (event.error) {
                    aiBubble.textContent = `[error: ${event.error}]`;
                }
            }
        }
    } catch (err) {
        aiBubble.textContent = '[stream error]';
    }
}

// ── Home form ─────────────────────────────────────────────────────────────────

const homeForm = document.getElementById('home-form');
const homeInput = document.getElementById('homeInput');
const homeSubmit = document.getElementById('homeSubmit');

document.querySelectorAll('.suggestion').forEach(btn => {
    btn.onclick = () => {
        homeInput.value = btn.dataset.prompt;
        homeForm.requestSubmit();
    };
});

homeForm.onsubmit = async function (e) {
    e.preventDefault();
    const raw = homeInput.value.trim();
    if (!raw) return;
    homeSubmit.disabled = true;
    homeInput.value = '';
    const chatId = await createNewChat();
    await sendMessage(raw, chatId);
    homeSubmit.disabled = false;
};

// ── Chat form ─────────────────────────────────────────────────────────────────

const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msgInput');
const msgSubmit = document.getElementById('msgSubmit');

document.getElementById('new-chat-btn').onclick = () => createNewChat();

chatForm.onsubmit = async function (e) {
    e.preventDefault();
    const chatId = getActiveChatId();
    if (!chatId) return;
    const raw = msgInput.value.trim();
    if (!raw) return;
    msgSubmit.disabled = true;
    msgInput.value = '';
    await sendMessage(raw, chatId);
    msgSubmit.disabled = false;
    msgInput.focus();
};

// ── Boot ──────────────────────────────────────────────────────────────────────

initChats();
