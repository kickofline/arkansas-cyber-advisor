import { appendBubble } from './chat-bubble-maker.js';

let activeChatId = null;
let loadedChatId = null; // tracks what's currently rendered in #conversation

export function getActiveChatId() {
    return activeChatId;
}

// ── View switching ────────────────────────────────────────────────────────────

export function showHomeView() {
    document.getElementById('home-view').classList.add('active');
    document.getElementById('chat-view').classList.remove('active');
    activeChatId = null;
    // loadedChatId intentionally preserved — DOM is hidden but intact
}

export function showChatView() {
    document.getElementById('home-view').classList.remove('active');
    document.getElementById('chat-view').classList.add('active');
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchChats() {
    const res = await fetch('/api/chats');
    const { chats } = await res.json();
    return chats;
}

async function createChatAPI() {
    const res = await fetch('/api/chats', { method: 'POST' });
    return await res.json();
}

async function deleteChatAPI(chatId) {
    await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderChatList(chats) {
    const list = document.getElementById('chat-list');
    list.innerHTML = '';
    for (const chat of chats) {
        const item = document.createElement('div');
        item.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
        item.dataset.id = chat.id;

        const title = document.createElement('span');
        title.className = 'chat-title';
        title.textContent = chat.title;

        const del = document.createElement('button');
        del.className = 'chat-delete';
        del.textContent = '×';
        del.setAttribute('aria-label', 'Delete chat');
        del.onclick = async (e) => {
            e.stopPropagation();
            await deleteChatAPI(chat.id);
            const remaining = await refreshSidebar();
            if (chat.id === activeChatId) {
                if (remaining.length > 0) {
                    await navigateToChat(remaining[0].id);
                } else {
                    navigateToHome();
                }
            }
        };

        item.appendChild(title);
        item.appendChild(del);
        item.onclick = () => navigateToChat(chat.id);
        list.appendChild(item);
    }
}

export async function refreshSidebar() {
    const chats = await fetchChats();
    renderChatList(chats);
    return chats;
}

// ── Navigation ────────────────────────────────────────────────────────────────

export function navigateToHome() {
    history.pushState({}, '', '/');
    showHomeView();
}

export async function navigateToChat(chatId) {
    activeChatId = chatId;
    history.pushState({}, '', `/chat/${chatId}`);
    showChatView();

    // If this chat is already in the DOM (e.g. returning while stream is live), just show it
    if (chatId === loadedChatId) {
        document.getElementById('conversation').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
        await refreshSidebar();
        return;
    }

    loadedChatId = chatId;
    const conversation = document.getElementById('conversation');
    conversation.innerHTML = '';

    const res = await fetch(`/api/chats/${chatId}`);
    const chat = await res.json();

    for (const msg of chat.messages) {
        const bubble = appendBubble(msg.content, msg.role === 'assistant');
        if (msg.role === 'assistant') {
            bubble.innerHTML = marked.parse(msg.content);
        }
    }

    if (chat.messages.length > 0) {
        conversation.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    }

    await refreshSidebar();
}

export async function createNewChat() {
    const chat = await createChatAPI();
    loadedChatId = null; // force a fresh load
    await navigateToChat(chat.id);
    return chat.id;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function init() {
    const path = window.location.pathname;

    if (path.startsWith('/chat/')) {
        const chatId = path.slice('/chat/'.length);
        const chats = await fetchChats();
        if (chats.find(c => c.id === chatId)) {
            await navigateToChat(chatId);
        } else {
            // Chat not found, go home
            history.replaceState({}, '', '/');
            showHomeView();
        }
    } else {
        showHomeView();
    }
}

// Handle browser back/forward
window.addEventListener('popstate', async () => {
    const path = window.location.pathname;
    if (path.startsWith('/chat/')) {
        const chatId = path.slice('/chat/'.length);
        await navigateToChat(chatId);
    } else {
        showHomeView();
    }
});
