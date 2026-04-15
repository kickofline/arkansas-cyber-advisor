# Image Upload in Chat — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

---

## Overview

Users can attach one or more images to chat messages. Images are sent to the Ollama vision model alongside the text, stored in SQLite for 30 days, and displayed in chat history on reload.

---

## Database

New table added to `db.py` `_SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS message_images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    mimetype   TEXT NOT NULL,
    data       BLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

- `message_id` is nullable at insert time. Images are uploaded before the message row exists and linked after the message is saved.
- Unauthenticated users' images stay unlinked (`message_id = NULL`) and are reclaimed by the 30-day cleanup.
- **Cleanup:** Every upload request runs `DELETE FROM message_images WHERE created_at < datetime('now', '-30 days')` before inserting. No background thread required.

---

## Backend

### New blueprint: `images.py`

Registered at `/api/images` in `app.py`.

**`POST /api/images/upload`**
- Accepts `multipart/form-data` with field name `files[]` (one or more)
- Validates each file: mimetype must start with `image/`, max 5 MB per file
- Runs 30-day cleanup pass
- Inserts each image as a blob row with `message_id = NULL`
- Returns `{"ids": [1, 2, 3]}`
- No auth required (unauthenticated users can attach images to anonymous chats)

**`GET /api/images/<int:image_id>`**
- Returns the image blob with its stored `Content-Type`
- No auth required (IDs are sequential integers but the app is an internal tool; access is not a security concern)
- Returns 404 if not found

### Changes to `stream.py`

`POST /api/stream` accepts a new optional field:

```json
{ "message": "...", "chat_id": "...", "history": [...], "image_ids": [1, 2] }
```

Before building the Ollama message list, fetch blobs for each ID in `image_ids`, base64-encode them, and attach as the `images` field on the final user message:

```python
{"role": "user", "content": message, "images": ["<base64>", ...]}
```

After the streaming response is saved (auth users only), link images to the new message:

```sql
UPDATE message_images SET message_id = ? WHERE id IN (...)
```

### Changes to `chats.py`

`GET /api/chats/<chat_id>` extends the messages query to include image IDs per message:

```python
# For each message, fetch associated image IDs
image_rows = db.execute(
    'SELECT message_id, id FROM message_images WHERE message_id IN (...)'
).fetchall()
```

Each message in the response gains an `image_ids` field:

```json
{"id": 42, "role": "user", "content": "...", "image_ids": [1, 2]}
```

---

## Frontend

### `chat.js`

**Input area:**
- Add a hidden `<input type="file" accept="image/*" multiple id="img-input">` inside the input card
- Add an image/attach button (left side of input card footer) that triggers the file input
- On `change`: immediately `POST /api/images/upload` with the selected files; show a thumbnail strip above the textarea; track returned IDs in a `pendingImageIds` array local to `renderChat`
- Each thumbnail has an × button that removes it from the strip and from `pendingImageIds`

**Sending:**
- `sendMessage` includes `image_ids: pendingImageIds` in the `/api/stream` request body
- After sending, clear the thumbnail strip and reset `pendingImageIds = []`
- The `history` array push for the user message includes `image_ids` so images survive in-session without a reload

**Displaying messages (`appendMessage`):**
- When `role === 'user'` and the message has `image_ids`, render `<img src="/api/images/<id>" class="msg-image">` thumbnails above the text bubble
- Thumbnails are click-to-expand (open full-size in a new tab via `target="_blank"`)

**Chat history on reload:**
- `API.getChat` already returns messages; each message now includes `image_ids`
- `appendMessage` receives the full message object and renders thumbnails the same way as above

### `style.css`

- `.msg-image`: `max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer; display: block; margin-bottom: 4px`
- `.img-thumbnail-strip`: flex row, gap 8px, padding below textarea
- `.img-thumb-wrap`: relative positioned, contains thumbnail + × button
- Attach button styled to match the existing send button aesthetic (icon-only, same size)

---

## Constraints & Limits

- Max 5 MB per image file
- No hard cap on images per message enforced server-side; the browser's native file picker is the only gate
- Accepted mimetypes: `image/*` (validated server-side)
- 30-day retention, cleaned up lazily on upload
- Vision model: same as `OLLAMA_MODEL` config — no separate config needed

---

## Out of Scope

- Image compression or resizing server-side
- Admin visibility into user-uploaded images
- Image search or indexing for RAG
