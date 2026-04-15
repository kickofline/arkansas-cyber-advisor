# Image Upload in Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach multiple images to chat messages; images are stored in SQLite for 30 days and rendered in chat history on reload.

**Architecture:** A new `images.py` Flask blueprint handles pre-upload (returns IDs) and serving. `stream.py` accepts `image_ids` in the request, fetches blobs, base64-encodes them into the Ollama user message, then links them to the saved message row. `chats.py` joins `message_images` so history loads include image IDs. The frontend adds an attach button, thumbnail strip, and renders images in message bubbles.

**Tech Stack:** Python/Flask, SQLite (blob storage), Ollama Python SDK (images field), vanilla JS, no new dependencies.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `db.py` | Add `message_images` table to `_SCHEMA` |
| Create | `images.py` | Blueprint: upload + serve image blobs |
| Modify | `app.py` | Register images blueprint |
| Create | `tests/test_images.py` | Tests for upload, serve, cleanup |
| Modify | `stream.py` | Accept `image_ids`, encode blobs, link after save |
| Modify | `tests/test_stream.py` | Test stream with image_ids |
| Modify | `chats.py` | Return `image_ids` per message in `get_chat` |
| Modify | `tests/test_chats.py` | Test that `get_chat` returns `image_ids` |
| Modify | `static/api.js` | Add `API.uploadImages()` |
| Modify | `static/style.css` | Attach button, thumbnail strip, message image styles |
| Modify | `static/chat.js` | Attach button, preview strip, send image_ids, render in history |

---

## Task 1: DB Schema

**Files:**
- Modify: `db.py`

- [ ] **Step 1: Add the `message_images` table to `_SCHEMA`**

In `db.py`, insert the following block immediately after the closing of the `documents` table definition (after the `);` on the last line of `documents`) and before the closing `'''`:

```python
    CREATE TABLE IF NOT EXISTS message_images (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        filename   TEXT NOT NULL,
        mimetype   TEXT NOT NULL,
        data       BLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
```

The full `_SCHEMA` string now ends with:

```
    ...documents table...);

    CREATE TABLE IF NOT EXISTS message_images (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        filename   TEXT NOT NULL,
        mimetype   TEXT NOT NULL,
        data       BLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
'''
```

- [ ] **Step 2: Verify schema creates cleanly**

Run: `python -c "from app import create_app; app = create_app(); print('OK')"`

Expected: `OK` (no errors)

- [ ] **Step 3: Commit**

```bash
git add db.py
git commit -m "feat: add message_images table to schema"
```

---

## Task 2: images.py Blueprint + Registration + Tests

**Files:**
- Create: `images.py`
- Modify: `app.py`
- Create: `tests/test_images.py`

- [ ] **Step 1: Write the failing tests first**

Create `tests/test_images.py`:

```python
import io
import pytest
from app import create_app
from db import get_db


def test_upload_single_image(client):
    data = {'files[]': (io.BytesIO(b'\x89PNG\r\n'), 'test.png', 'image/png')}
    res = client.post('/api/images/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 201
    body = res.get_json()
    assert 'ids' in body
    assert len(body['ids']) == 1


def test_upload_multiple_images(client):
    data = [
        ('files[]', (io.BytesIO(b'img1'), 'a.png', 'image/png')),
        ('files[]', (io.BytesIO(b'img2'), 'b.jpeg', 'image/jpeg')),
    ]
    res = client.post('/api/images/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 201
    assert len(res.get_json()['ids']) == 2


def test_upload_rejects_non_image(client):
    data = {'files[]': (io.BytesIO(b'hello'), 'doc.txt', 'text/plain')}
    res = client.post('/api/images/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 400


def test_upload_rejects_oversized_file(client):
    big = b'x' * (5 * 1024 * 1024 + 1)
    data = {'files[]': (io.BytesIO(big), 'big.png', 'image/png')}
    res = client.post('/api/images/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 400


def test_serve_image(client):
    data = {'files[]': (io.BytesIO(b'\x89PNG'), 'test.png', 'image/png')}
    upload_res = client.post('/api/images/upload', data=data, content_type='multipart/form-data')
    img_id = upload_res.get_json()['ids'][0]

    res = client.get(f'/api/images/{img_id}')
    assert res.status_code == 200
    assert res.content_type == 'image/png'
    assert res.data == b'\x89PNG'


def test_serve_image_not_found(client):
    res = client.get('/api/images/99999')
    assert res.status_code == 404


def test_cleanup_deletes_old_images(app):
    with app.app_context():
        db = get_db()
        db.execute(
            "INSERT INTO message_images (filename, mimetype, data, created_at) "
            "VALUES (?, ?, ?, datetime('now', '-31 days'))",
            ['old.png', 'image/png', b'old-data']
        )
        db.commit()
        count_before = db.execute('SELECT COUNT(*) FROM message_images').fetchone()[0]
        assert count_before == 1

        from images import _cleanup_old_images
        _cleanup_old_images(db)
        db.commit()

        count_after = db.execute('SELECT COUNT(*) FROM message_images').fetchone()[0]
        assert count_after == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `python -m pytest tests/test_images.py -v`

Expected: All tests fail with `404` or `ImportError` (blueprint not registered yet)

- [ ] **Step 3: Create `images.py`**

```python
import base64
from flask import Blueprint, request, jsonify, Response
from db import get_db

bp = Blueprint('images', __name__, url_prefix='/api')

_MAX_SIZE = 5 * 1024 * 1024  # 5 MB


def _cleanup_old_images(db):
    db.execute("DELETE FROM message_images WHERE created_at < datetime('now', '-30 days')")


@bp.route('/images/upload', methods=['POST'])
def upload_images():
    files = request.files.getlist('files[]')
    if not files or not any(f.filename for f in files):
        return jsonify({'error': 'No files provided'}), 400

    db = get_db()
    _cleanup_old_images(db)

    ids = []
    for file in files:
        if not file or not file.filename:
            continue
        mimetype = file.content_type or ''
        if not mimetype.startswith('image/'):
            return jsonify({'error': f'{file.filename} is not an image'}), 400
        data = file.read()
        if len(data) > _MAX_SIZE:
            return jsonify({'error': f'{file.filename} exceeds 5 MB limit'}), 400
        cursor = db.execute(
            'INSERT INTO message_images (filename, mimetype, data) VALUES (?, ?, ?)',
            [file.filename, mimetype, data]
        )
        ids.append(cursor.lastrowid)

    db.commit()
    return jsonify({'ids': ids}), 201


@bp.route('/images/<int:image_id>', methods=['GET'])
def serve_image(image_id):
    db = get_db()
    row = db.execute(
        'SELECT data, mimetype FROM message_images WHERE id = ?', [image_id]
    ).fetchone()
    if row is None:
        return jsonify({'error': 'Not found'}), 404
    return Response(bytes(row['data']), content_type=row['mimetype'])
```

- [ ] **Step 4: Register the blueprint in `app.py`**

Add after the existing blueprint registrations (before the `serve` route):

```python
    from images import bp as images_bp
    app.register_blueprint(images_bp)
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `python -m pytest tests/test_images.py -v`

Expected: All 7 tests pass

- [ ] **Step 6: Commit**

```bash
git add images.py app.py tests/test_images.py
git commit -m "feat: add image upload and serve endpoints"
```

---

## Task 3: stream.py — Image Support

**Files:**
- Modify: `stream.py`
- Modify: `tests/test_stream.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_stream.py`:

```python
def test_stream_sends_images_to_ollama(auth_client):
    import io
    upload_res = auth_client.post(
        '/api/images/upload',
        data={'files[]': (io.BytesIO(b'\x89PNG'), 'test.png', 'image/png')},
        content_type='multipart/form-data',
    )
    assert upload_res.status_code == 201
    img_id = upload_res.get_json()['ids'][0]

    mock_chunks = [_make_chunk('I see an image')]
    with patch('stream.get_ollama_client') as mock_factory:
        mock_client = MagicMock()
        mock_client.chat.return_value = iter(mock_chunks)
        mock_factory.return_value = mock_client

        create_res = auth_client.post('/api/chats', json={'title': 'Img Chat'})
        chat_id = create_res.get_json()['id']
        auth_client.post(
            f'/api/chats/{chat_id}/messages',
            json={'role': 'user', 'content': 'What is this?'}
        )

        res = auth_client.post('/api/stream', json={
            'message': 'What is this?',
            'history': [],
            'chat_id': chat_id,
            'image_ids': [img_id],
        })
        _ = res.data  # consume stream

    call_kwargs = mock_client.chat.call_args_list[-1].kwargs
    messages_sent = call_kwargs['messages']
    user_msg = next(m for m in messages_sent if m['role'] == 'user')
    assert 'images' in user_msg
    assert len(user_msg['images']) == 1
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `python -m pytest tests/test_stream.py::test_stream_sends_images_to_ollama -v`

Expected: FAIL — `AssertionError: assert 'images' in user_msg`

- [ ] **Step 3: Update `stream.py`**

Add `import base64` at the top of the file (after the existing imports):

```python
import base64
```

In the `stream()` view function, extract `image_ids` from the request data. Replace the line:

```python
    history = data.get('history') or []
```

with:

```python
    history   = data.get('history') or []
    image_ids = [i for i in (data.get('image_ids') or []) if isinstance(i, int)]
```

Then replace the line that appends the user message:

```python
    messages.append({'role': 'user', 'content': message})
```

with:

```python
    user_msg = {'role': 'user', 'content': message}
    if image_ids:
        db_conn = get_db()
        blobs = []
        for img_id in image_ids:
            row = db_conn.execute(
                'SELECT data FROM message_images WHERE id = ?', [img_id]
            ).fetchone()
            if row:
                blobs.append(base64.b64encode(bytes(row['data'])).decode('utf-8'))
        if blobs:
            user_msg['images'] = blobs
    messages.append(user_msg)
```

Then, inside the `generate()` function, after the existing block that saves the assistant message to DB, add image linking. Replace:

```python
            if is_auth and chat_id and full_response:
                db = get_db()
                db.execute(
                    'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)',
                    [chat_id, 'assistant', ''.join(full_response)]
                )
                db.commit()
```

with:

```python
            if is_auth and chat_id and full_response:
                db = get_db()
                db.execute(
                    'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)',
                    [chat_id, 'assistant', ''.join(full_response)]
                )
                if image_ids:
                    user_row = db.execute(
                        'SELECT id FROM messages WHERE chat_id=? AND role=? '
                        'ORDER BY created_at DESC LIMIT 1',
                        [chat_id, 'user']
                    ).fetchone()
                    if user_row:
                        for img_id in image_ids:
                            db.execute(
                                'UPDATE message_images SET message_id=? WHERE id=?',
                                [user_row['id'], img_id]
                            )
                db.commit()
```

- [ ] **Step 4: Run all stream tests**

Run: `python -m pytest tests/test_stream.py -v`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add stream.py tests/test_stream.py
git commit -m "feat: pass images to Ollama and link to message after stream"
```

---

## Task 4: chats.py — Return image_ids per Message

**Files:**
- Modify: `chats.py`
- Modify: `tests/test_chats.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_chats.py`:

```python
def test_get_chat_messages_include_image_ids(auth_client):
    import io
    create_res = auth_client.post('/api/chats', json={'title': 'Img Chat'})
    chat_id = create_res.get_json()['id']

    # Add a user message
    auth_client.post(
        f'/api/chats/{chat_id}/messages',
        json={'role': 'user', 'content': 'Look at this'}
    )

    # Get messages — image_ids should default to empty list
    res = auth_client.get(f'/api/chats/{chat_id}')
    assert res.status_code == 200
    messages = res.get_json()['messages']
    assert len(messages) == 1
    assert messages[0]['image_ids'] == []
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `python -m pytest tests/test_chats.py::test_get_chat_messages_include_image_ids -v`

Expected: FAIL — `KeyError: 'image_ids'`

- [ ] **Step 3: Update `get_chat` in `chats.py`**

Replace the current `get_chat` function body after the messages query:

```python
    messages = db.execute(
        'SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at',
        [chat_id]
    ).fetchall()
    return jsonify({'chat': dict(chat), 'messages': [dict(m) for m in messages]})
```

with:

```python
    messages = db.execute(
        'SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at',
        [chat_id]
    ).fetchall()
    message_list = [dict(m) for m in messages]

    img_map = {}
    if message_list:
        msg_ids = [m['id'] for m in message_list]
        placeholders = ','.join('?' * len(msg_ids))
        img_rows = db.execute(
            f'SELECT message_id, id FROM message_images WHERE message_id IN ({placeholders})',
            msg_ids
        ).fetchall()
        for row in img_rows:
            img_map.setdefault(row['message_id'], []).append(row['id'])

    for m in message_list:
        m['image_ids'] = img_map.get(m['id'], [])

    return jsonify({'chat': dict(chat), 'messages': message_list})
```

- [ ] **Step 4: Run all chat tests**

Run: `python -m pytest tests/test_chats.py -v`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add chats.py tests/test_chats.py
git commit -m "feat: include image_ids per message in get_chat response"
```

---

## Task 5: api.js — Add uploadImages

**Files:**
- Modify: `static/api.js`

- [ ] **Step 1: Add `uploadImages` to the `API` object**

In `static/api.js`, add the following method inside the `API` object, after the `migrate` line:

```javascript
  uploadImages: (formData) =>
    fetch('/api/images/upload', { method: 'POST', credentials: 'same-origin', body: formData })
      .then(r => r.json()),
```

The API object around that area should now look like:

```javascript
  migrate:      (chats)         => API.post('/api/migrate', { chats }),
  uploadImages: (formData)      =>
    fetch('/api/images/upload', { method: 'POST', credentials: 'same-origin', body: formData })
      .then(r => r.json()),
```

- [ ] **Step 2: Commit**

```bash
git add static/api.js
git commit -m "feat: add API.uploadImages to api.js"
```

---

## Task 6: style.css — Attachment and Thumbnail Styles

**Files:**
- Modify: `static/style.css`

- [ ] **Step 1: Change input-card-footer to use space-between**

Find the `.input-card-footer` rule (currently `justify-content: flex-end`) and change it to:

```css
.input-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 10px;
}
```

- [ ] **Step 2: Add all new image-related rules**

Append the following at the end of `static/style.css`:

```css
/* ── Image attachment ─────────────────────────────────────────────────────── */
.input-card-left {
  display: flex;
  align-items: center;
}
.attach-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s;
  flex-shrink: 0;
}
.attach-btn:hover { background: var(--bg-3); }

.img-thumbnail-strip {
  display: none;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 14px 0;
}
.img-thumb-wrap {
  position: relative;
  display: inline-block;
}
.img-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  display: block;
}
.img-thumb-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: var(--text);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
}
.img-thumb-remove:hover { background: var(--danger); }

.msg-image-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.msg-image {
  max-width: 200px;
  max-height: 150px;
  border-radius: 8px;
  border: 1px solid var(--border);
  display: block;
  cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "feat: add image attachment and thumbnail styles"
```

---

## Task 7: chat.js — Full Frontend Integration

**Files:**
- Modify: `static/chat.js`

- [ ] **Step 1: Update the `renderChat` HTML template**

In `renderChat`, replace the `<div class="input-card">` block in the `main.innerHTML = \`...\`` template. Find:

```html
          <div class="input-card">
            <textarea id="msg-input" rows="1" placeholder="How can I help?"></textarea>
            <div class="input-card-footer">
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
```

Replace with:

```html
          <div class="input-card">
            <div class="img-thumbnail-strip" id="img-strip"></div>
            <textarea id="msg-input" rows="1" placeholder="How can I help?"></textarea>
            <div class="input-card-footer">
              <div class="input-card-left">
                <button class="attach-btn" id="attach-btn" title="Attach images">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <path d="M13.5 7.5l-6.5 6.5a4 4 0 0 1-5.657-5.657l7.07-7.07a2.5 2.5 0 0 1 3.536 3.536L5.879 11.38A1 1 0 0 1 4.464 9.97l6.364-6.364"/>
                  </svg>
                </button>
                <input type="file" id="img-input" accept="image/*" multiple style="display:none">
              </div>
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
```

- [ ] **Step 2: Wire up attach button and file input**

After the existing element selections in `renderChat` (the block that gets `messagesEl`, `inputEl`, `sendBtn`, `titleEl`), add:

```javascript
  const attachBtn = document.getElementById('attach-btn');
  const imgInput  = document.getElementById('img-input');
  const imgStrip  = document.getElementById('img-strip');
  let pendingImageIds = [];

  attachBtn.addEventListener('click', () => imgInput.click());

  imgInput.addEventListener('change', async () => {
    const files = Array.from(imgInput.files);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(f => formData.append('files[]', f));

    try {
      const { ids } = await API.uploadImages(formData);
      ids.forEach((id, i) => {
        pendingImageIds.push(id);
        const wrap = document.createElement('div');
        wrap.className = 'img-thumb-wrap';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(files[i]);
        img.className = 'img-thumb';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'img-thumb-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
          pendingImageIds = pendingImageIds.filter(x => x !== id);
          wrap.remove();
          if (!imgStrip.children.length) imgStrip.style.display = 'none';
        });
        wrap.appendChild(img);
        wrap.appendChild(removeBtn);
        imgStrip.appendChild(wrap);
      });
      imgStrip.style.display = 'flex';
    } catch (e) {
      console.error('[chat] image upload failed', e);
    }
    imgInput.value = '';
  });
```

- [ ] **Step 3: Include `image_ids` in the stream request and clear after send**

In `sendMessage`, find the `fetch('/api/stream', ...)` call. Replace its `body`:

```javascript
        body: JSON.stringify({
          message: text,
          chat_id: State.user ? activeChatId : null,
          history: history.slice(0, -1),
        }),
```

with:

```javascript
        body: JSON.stringify({
          message: text,
          chat_id: State.user ? activeChatId : null,
          history: history.slice(0, -1),
          image_ids: pendingImageIds,
        }),
```

Then, immediately after `inputEl.value = '';` and `inputEl.style.height = 'auto';` at the top of `sendMessage` (where the input is cleared), add:

```javascript
    const sentImageIds = [...pendingImageIds];
    pendingImageIds = [];
    imgStrip.innerHTML = '';
    imgStrip.style.display = 'none';
```

Change the `appendMessage` call for the user message from:

```javascript
    appendMessage(messagesEl, 'user', text);
    history.push({ role: 'user', content: text });
```

to:

```javascript
    appendMessage(messagesEl, 'user', text, sentImageIds);
    history.push({ role: 'user', content: text, image_ids: sentImageIds });
```

- [ ] **Step 4: Update `appendMessage` signature and render images**

Replace the entire `appendMessage` function with:

```javascript
function appendMessage(container, role, content, imageIds = []) {
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
    if (imageIds.length > 0) {
      const strip = document.createElement('div');
      strip.className = 'msg-image-strip';
      imageIds.forEach(id => {
        const a = document.createElement('a');
        a.href = `/api/images/${id}`;
        a.target = '_blank';
        const img = document.createElement('img');
        img.src = `/api/images/${id}`;
        img.className = 'msg-image';
        a.appendChild(img);
        strip.appendChild(a);
      });
      bubble.appendChild(strip);
    }
    const textEl = document.createElement('div');
    textEl.textContent = content;
    bubble.appendChild(textEl);
  }

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  return bubble;
}
```

- [ ] **Step 5: Update history rendering to pass image_ids**

In `renderChat`, find the line that renders history:

```javascript
  history.forEach(m => appendMessage(messagesEl, m.role, m.content));
```

Replace with:

```javascript
  history.forEach(m => appendMessage(messagesEl, m.role, m.content, m.image_ids || []));
```

- [ ] **Step 6: Run the full test suite**

Run: `python -m pytest -v`

Expected: All existing tests plus the new ones pass

- [ ] **Step 7: Commit**

```bash
git add static/chat.js
git commit -m "feat: image attach button, thumbnail preview, and rendering in chat history"
```

---

## Self-Review Checklist

After implementation, verify against the spec:

- [ ] `message_images` table created with nullable `message_id` — Task 1
- [ ] `POST /api/images/upload`: validates `image/*`, rejects >5 MB, runs 30-day cleanup, returns IDs — Task 2
- [ ] `GET /api/images/<id>`: serves blob with correct Content-Type, 404 on miss — Task 2
- [ ] `stream.py` accepts `image_ids`, base64-encodes blobs, passes to Ollama `images` field — Task 3
- [ ] Images linked to user message row after successful stream — Task 3
- [ ] `GET /api/chats/<id>` returns `image_ids` per message — Task 4
- [ ] `API.uploadImages` added — Task 5
- [ ] Attach button, hidden file input, thumbnail strip with × buttons — Task 7
- [ ] `pendingImageIds` cleared and strip reset after send — Task 7
- [ ] `appendMessage` renders images for user messages; click opens in new tab — Task 7
- [ ] History on reload shows images — Task 7
