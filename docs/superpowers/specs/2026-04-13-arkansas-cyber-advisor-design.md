# Arkansas Cyber Advisor — Design Spec
**Date:** 2026-04-13

## Overview

A publicly accessible cybersecurity advisory web app for Arkansas residents — parents, students, small business owners, and non-technical users. Provides both free-form Q&A chat and guided scenario-based flows. Built with Flask, SQLite, and a vanilla JS SPA frontend. Optional user accounts with email/password; the app is fully usable without logging in.

---

## Architecture

```
Browser (Vanilla JS SPA)
  └── Flask API (Python)
        ├── Auth routes   (/register, /login, /logout)
        ├── Chat routes   (/api/chats, /api/chats/:id/messages)
        └── Stream route  (/api/stream)  ← SSE, talks to Ollama
              └── Ollama  (10.1.0.155, model: gpt-oss:20b)

Storage
  └── SQLite
        ├── users     (id, email, hashed_password, created_at)
        ├── chats     (id, user_id NOT NULL → users.id, title, created_at)
        └── messages  (id, chat_id NOT NULL → chats.id, role, content, created_at)
```

**Environment variables (`.env`):**
- `OLLAMA_URL` — base URL of the Ollama instance (`10.1.0.155`)
- `WEBUI_KEY` — reserved for future admin use, not enforced for public access
- `SECRET_KEY` — Flask session secret (to be added)

---

## Frontend SPA

### Routing (hash-based)

| Route | Description |
|---|---|
| `#/` | Home — guided scenario cards + "Start chatting" CTA |
| `#/chat` | New chat |
| `#/chat/:id` | Specific chat by ID |
| `#/login` | Login page |
| `#/register` | Registration page |

Hash-based routing requires no server-side config and works on any static host or Flask serve.

### Layout

- **Left sidebar:** list of past chats, "New Chat" button, login/register link or account menu
- **Main area:** message thread with streaming response, typing indicator, input box pinned to bottom
- **Reasoning blocks:** model `<think>...</think>` output collapsed into a "Show reasoning" toggle by default

### Guided Scenarios

Cards on the home screen pre-seed a chat with a scenario-specific system prompt. Initial scenarios:

- "I think I got hacked"
- "Protect my small business"
- "My child is being targeted online"
- "I received a suspicious email"
- "How do I make my passwords safer?"

### Markdown Rendering

- Assistant messages rendered via `marked.js`
- User messages rendered as plain text (no HTML injection risk)

### Ollama Unavailable

- Spinner shown while streaming
- On connection failure or timeout: inline error message in the chat bubble with a **Retry** button
- No global error page — errors are scoped to the message

---

## Backend

### Auth

| Route | Method | Description |
|---|---|---|
| `/register` | POST | Validate unique email, hash password (Werkzeug), create user, log in |
| `/login` | POST | Verify credentials, set secure HTTP-only session cookie |
| `/logout` | POST | Clear session |

Sessions managed via Flask-Login. Passwords hashed with Werkzeug's `generate_password_hash`.

### Chat API

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/chats` | GET | Required | List user's chats |
| `/api/chats` | POST | Required | Create new chat |
| `/api/chats/:id` | GET | Required | Get chat + messages |
| `/api/chats/:id/messages` | POST | Required | Append a message |
| `/api/migrate` | POST | Required | Import localStorage chats into account |

Unauthenticated requests to `/api/chats` routes return `401`. The frontend detects this and falls back to localStorage.

### Streaming

**Message save flow (logged-in):**
1. Frontend POSTs user message to `/api/chats/:id/messages` — saved immediately
2. Frontend opens `EventSource` to `GET /api/stream?chat_id=<id>&message=<encoded>`
3. Backend streams tokens as `data: <token>\n\n` events
4. On `data: [DONE]` event: backend has saved the full assistant message to SQLite
5. Frontend marks message complete

**Message save flow (logged-out):**
1. Frontend saves user message to `localStorage` immediately
2. Frontend opens `EventSource` to `GET /api/stream?message=<encoded>` (no chat_id)
3. Backend streams tokens; does not persist anything
4. On `data: [DONE]`: frontend saves full assistant message to `localStorage`

**Error handling:**
- On Ollama error or timeout: backend sends `data: [ERROR]\n\n`; frontend shows inline retry button
- `EventSource` uses GET (required by browser spec); message content is URL-encoded in the query string; long messages truncated to 4000 chars max

### System Prompt

All chats initialized with:

> "You are a friendly, plain-language cybersecurity advisor for Arkansas residents. Your audience includes parents, students, small business owners, and non-technical users. Give practical, actionable advice. Avoid jargon. If someone may be in immediate danger (e.g., active account compromise), tell them what to do first."

Guided scenario chats append an additional scenario-specific instruction after the base prompt.

### Chat Titles

Auto-generated on the backend from the first user message (first ~6 words, trimmed). Stored in the `chats.title` column.

---

## Data Persistence

### Logged-in users
All chats and messages stored in SQLite. Accessible from any browser after login.

### Logged-out users
Chats stored in browser `localStorage` only. Identified by a UUID generated on first visit and stored in `localStorage`.

### Migration on login
When a logged-out user logs in or registers, the frontend reads all chats from `localStorage`, POSTs them to `/api/migrate`, and clears `localStorage`. The user's existing chats are merged into their account.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Ollama unreachable | Inline error + retry button in chat |
| Ollama slow (>30s) | Streaming timeout, same inline error |
| Invalid login | Form-level error message |
| Duplicate email on register | Form-level error message |
| Unauthenticated API call | 401 → frontend uses localStorage |

---

## Out of Scope

- Admin dashboard
- Rate limiting (can be added via reverse proxy later)
- Email verification
- Password reset flow
- OAuth / social login
- Multi-language support
