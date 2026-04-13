# Arkansas Cyber Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publicly accessible Flask + SQLite + Vanilla JS SPA cybersecurity advisory app for Arkansas residents, with optional email/password accounts and streaming AI responses from a local Ollama model.

**Architecture:** Flask serves both the API and the static SPA. SQLite stores users, chats, and messages for authenticated users. Logged-out users get localStorage-only persistence. The frontend is a hash-routed SPA with no build step — just static files served by Flask.

**Tech Stack:** Python 3, Flask 3, Flask-Login, Werkzeug, SQLite (stdlib), ollama 0.6.1, python-dotenv, pytest, pytest-flask, marked.js (CDN), vanilla JS (ES2020)

---

## File Structure

```
arkansas-cyber-advisor/
├── app.py                  # Flask app factory, blueprint registration, SPA catch-all
├── config.py               # Config loaded from .env
├── db.py                   # SQLite connection helper, schema init
├── auth.py                 # /register /login /logout /api/me + User model
├── chats.py                # /api/chats CRUD + /api/migrate
├── stream.py               # /api/stream SSE route, Ollama client
├── requirements.txt        # Pinned dependencies
├── .env                    # Already exists: WEBUI_KEY, OLLAMA_URL
├── tests/
│   ├── conftest.py         # pytest fixtures: app, client, auth helpers
│   ├── test_auth.py        # register, login, logout, me
│   ├── test_chats.py       # chat CRUD, message save, migrate
│   └── test_stream.py      # stream route with mocked Ollama
└── static/
    ├── index.html          # SPA shell — loads all JS/CSS, no content
    ├── style.css           # Dark theme, responsive layout
    ├── app.js              # Entry point — init router, check auth, mount views
    ├── router.js           # Hash-based SPA router with param extraction
    ├── api.js              # fetch wrapper for backend API + LocalChats for logged-out
    ├── home.js             # Home page: scenario cards + "New Chat" CTA
    ├── auth.js             # Login and register page views
    ├── sidebar.js          # Left sidebar: chat list, nav links
    └── chat.js             # Chat view: message thread, streaming, reasoning blocks
```

---

## Task 1: Dependencies + Config + App Factory

**Files:**
- Create: `requirements.txt`
- Create: `config.py`
- Create: `app.py`

- [ ] **Step 1: Create requirements.txt**

```
flask==3.1.2
flask-login==0.6.3
python-dotenv==1.0.1
ollama==0.6.1
werkzeug==3.1.5
pytest==8.3.5
pytest-flask==1.3.0
```

- [ ] **Step 2: Install missing dependencies**

```bash
uv pip install flask-login==0.6.3 python-dotenv==1.0.1 pytest==8.3.5 pytest-flask==1.3.0
```

Expected: packages install without error.

- [ ] **Step 3: Create config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DATABASE = os.environ.get('DATABASE', 'cyber_advisor.db')
    OLLAMA_HOST = os.environ.get('OLLAMA_URL', 'localhost')
    OLLAMA_BASE_URL = f"http://{os.environ.get('OLLAMA_URL', 'localhost')}:11434"
    OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'gpt-oss:20b')
    TESTING = False

class TestConfig(Config):
    TESTING = True
    DATABASE = ':memory:'
    SECRET_KEY = 'test-secret'
    WTF_CSRF_ENABLED = False
```

- [ ] **Step 4: Create app.py**

```python
from flask import Flask
from config import Config


def create_app(config=None):
    app = Flask(__name__, static_folder='static', static_url_path='')
    app.config.from_object(Config)
    if config:
        app.config.update(config)

    from db import init_app as init_db_app
    init_db_app(app)

    from flask_login import LoginManager
    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        from flask import jsonify
        return jsonify({'error': 'Authentication required'}), 401

    from auth import bp as auth_bp, load_user
    login_manager.user_loader(load_user)
    app.register_blueprint(auth_bp)

    from chats import bp as chats_bp
    app.register_blueprint(chats_bp)

    from stream import bp as stream_bp
    app.register_blueprint(stream_bp)

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        return app.send_static_file('index.html')

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
```

- [ ] **Step 5: Verify app starts**

```bash
cd "C:/Users/drewd/OneDrive - Ouachita Baptist University/arkansas-cyber-advisor"
.venv/Scripts/python app.py
```

Expected: `Running on http://127.0.0.1:5000` (will error on missing modules — that's fine, just check imports don't fail before db/auth are created). Stop with Ctrl+C once you see the line.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt config.py app.py
git commit -m "feat: add project scaffold, config, and app factory"
```

---

## Task 2: Database Schema

**Files:**
- Create: `db.py`
- Create: `tests/conftest.py`
- Create: `tests/test_db.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_db.py`:

```python
def test_schema_creates_tables(app):
    from db import get_db
    with app.app_context():
        db = get_db()
        tables = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        names = {r['name'] for r in tables}
        assert 'users' in names
        assert 'chats' in names
        assert 'messages' in names
```

Create `tests/conftest.py`:

```python
import pytest
from config import TestConfig
from app import create_app


@pytest.fixture
def app():
    application = create_app({'TESTING': True, 'DATABASE': ':memory:', 'SECRET_KEY': 'test'})
    yield application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_client(client):
    """Returns a client already registered and logged in."""
    client.post('/register', json={'email': 'test@example.com', 'password': 'password123'})
    return client
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd "C:/Users/drewd/OneDrive - Ouachita Baptist University/arkansas-cyber-advisor"
.venv/Scripts/pytest tests/test_db.py -v
```

Expected: `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 3: Create db.py**

```python
import sqlite3
from flask import g, current_app


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(
            current_app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    db.commit()


def init_app(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
```

- [ ] **Step 4: Run test — verify PASS**

```bash
.venv/Scripts/pytest tests/test_db.py -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add db.py tests/conftest.py tests/test_db.py
git commit -m "feat: add SQLite schema and db helpers"
```

---

## Task 3: Auth Routes

**Files:**
- Create: `auth.py`
- Create: `tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_auth.py`:

```python
def test_register_success(client):
    res = client.post('/register', json={'email': 'alice@example.com', 'password': 'securepass1'})
    assert res.status_code == 201
    data = res.get_json()
    assert data['email'] == 'alice@example.com'
    assert 'id' in data


def test_register_duplicate_email(client):
    client.post('/register', json={'email': 'alice@example.com', 'password': 'securepass1'})
    res = client.post('/register', json={'email': 'alice@example.com', 'password': 'securepass1'})
    assert res.status_code == 409


def test_register_short_password(client):
    res = client.post('/register', json={'email': 'bob@example.com', 'password': 'short'})
    assert res.status_code == 400


def test_login_success(client):
    client.post('/register', json={'email': 'alice@example.com', 'password': 'securepass1'})
    res = client.post('/login', json={'email': 'alice@example.com', 'password': 'securepass1'})
    assert res.status_code == 200
    data = res.get_json()
    assert data['email'] == 'alice@example.com'


def test_login_wrong_password(client):
    client.post('/register', json={'email': 'alice@example.com', 'password': 'securepass1'})
    res = client.post('/login', json={'email': 'alice@example.com', 'password': 'wrongpass'})
    assert res.status_code == 401


def test_logout(auth_client):
    res = auth_client.post('/logout')
    assert res.status_code == 200


def test_me_authenticated(auth_client):
    res = auth_client.get('/api/me')
    assert res.status_code == 200
    data = res.get_json()
    assert data['email'] == 'test@example.com'


def test_me_unauthenticated(client):
    res = client.get('/api/me')
    assert res.status_code == 200
    data = res.get_json()
    assert data['user'] is None
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
.venv/Scripts/pytest tests/test_auth.py -v
```

Expected: errors about missing `auth` module.

- [ ] **Step 3: Create auth.py**

```python
from flask import Blueprint, request, jsonify
from flask_login import UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from db import get_db

bp = Blueprint('auth', __name__)


class User(UserMixin):
    def __init__(self, id, email):
        self.id = id
        self.email = email


def load_user(user_id):
    db = get_db()
    row = db.execute('SELECT id, email FROM users WHERE id = ?', [user_id]).fetchone()
    if row is None:
        return None
    return User(row['id'], row['email'])


@bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    db = get_db()
    if db.execute('SELECT id FROM users WHERE email = ?', [email]).fetchone():
        return jsonify({'error': 'Email already registered'}), 409

    db.execute(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        [email, generate_password_hash(password)]
    )
    db.commit()

    row = db.execute('SELECT id, email FROM users WHERE email = ?', [email]).fetchone()
    login_user(User(row['id'], row['email']))
    return jsonify({'id': row['id'], 'email': row['email']}), 201


@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    db = get_db()
    row = db.execute(
        'SELECT id, email, password_hash FROM users WHERE email = ?', [email]
    ).fetchone()
    if row is None or not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Invalid email or password'}), 401

    login_user(User(row['id'], row['email']))
    return jsonify({'id': row['id'], 'email': row['email']})


@bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'ok': True})


@bp.route('/api/me')
def me():
    if current_user.is_authenticated:
        return jsonify({'id': current_user.id, 'email': current_user.email})
    return jsonify({'user': None})
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
.venv/Scripts/pytest tests/test_auth.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add auth.py tests/test_auth.py
git commit -m "feat: add auth routes (register, login, logout, me)"
```

---

## Task 4: Chat CRUD + Migrate Routes

**Files:**
- Create: `chats.py`
- Create: `tests/test_chats.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_chats.py`:

```python
def test_list_chats_unauthenticated(client):
    res = client.get('/api/chats')
    assert res.status_code == 401


def test_create_chat(auth_client):
    res = auth_client.post('/api/chats', json={'title': 'My First Chat'})
    assert res.status_code == 201
    data = res.get_json()
    assert data['title'] == 'My First Chat'
    assert 'id' in data


def test_list_chats(auth_client):
    auth_client.post('/api/chats', json={'title': 'Chat One'})
    auth_client.post('/api/chats', json={'title': 'Chat Two'})
    res = auth_client.get('/api/chats')
    assert res.status_code == 200
    data = res.get_json()
    assert len(data) == 2


def test_get_chat(auth_client):
    create_res = auth_client.post('/api/chats', json={'title': 'Test Chat'})
    chat_id = create_res.get_json()['id']
    res = auth_client.get(f'/api/chats/{chat_id}')
    assert res.status_code == 200
    data = res.get_json()
    assert data['chat']['title'] == 'Test Chat'
    assert data['messages'] == []


def test_get_chat_not_found(auth_client):
    res = auth_client.get('/api/chats/nonexistent-id')
    assert res.status_code == 404


def test_add_message(auth_client):
    create_res = auth_client.post('/api/chats', json={'title': 'Test Chat'})
    chat_id = create_res.get_json()['id']
    res = auth_client.post(
        f'/api/chats/{chat_id}/messages',
        json={'role': 'user', 'content': 'Hello!'}
    )
    assert res.status_code == 201
    chat_res = auth_client.get(f'/api/chats/{chat_id}')
    messages = chat_res.get_json()['messages']
    assert len(messages) == 1
    assert messages[0]['content'] == 'Hello!'


def test_migrate_chats(auth_client):
    chats = [
        {
            'title': 'Old Chat',
            'messages': [
                {'role': 'user', 'content': 'Hi'},
                {'role': 'assistant', 'content': 'Hello!'}
            ]
        }
    ]
    res = auth_client.post('/api/migrate', json={'chats': chats})
    assert res.status_code == 200
    data = res.get_json()
    assert data['imported'] == 1
    list_res = auth_client.get('/api/chats')
    assert len(list_res.get_json()) == 1
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
.venv/Scripts/pytest tests/test_chats.py -v
```

Expected: errors about missing `chats` module.

- [ ] **Step 3: Create chats.py**

```python
import uuid
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from db import get_db

bp = Blueprint('chats', __name__, url_prefix='/api')


@bp.route('/chats', methods=['GET'])
@login_required
def list_chats():
    db = get_db()
    rows = db.execute(
        'SELECT id, title, created_at FROM chats WHERE user_id = ? ORDER BY created_at DESC',
        [current_user.id]
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@bp.route('/chats', methods=['POST'])
@login_required
def create_chat():
    data = request.get_json() or {}
    title = (data.get('title') or 'New Chat')[:100]
    chat_id = str(uuid.uuid4())
    db = get_db()
    db.execute(
        'INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)',
        [chat_id, current_user.id, title]
    )
    db.commit()
    row = db.execute(
        'SELECT id, title, created_at FROM chats WHERE id = ?', [chat_id]
    ).fetchone()
    return jsonify(dict(row)), 201


@bp.route('/chats/<chat_id>', methods=['GET'])
@login_required
def get_chat(chat_id):
    db = get_db()
    chat = db.execute(
        'SELECT id, title, created_at FROM chats WHERE id = ? AND user_id = ?',
        [chat_id, current_user.id]
    ).fetchone()
    if chat is None:
        return jsonify({'error': 'Not found'}), 404
    messages = db.execute(
        'SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at',
        [chat_id]
    ).fetchall()
    return jsonify({'chat': dict(chat), 'messages': [dict(m) for m in messages]})


@bp.route('/chats/<chat_id>/messages', methods=['POST'])
@login_required
def add_message(chat_id):
    db = get_db()
    if not db.execute(
        'SELECT id FROM chats WHERE id = ? AND user_id = ?', [chat_id, current_user.id]
    ).fetchone():
        return jsonify({'error': 'Not found'}), 404

    data = request.get_json() or {}
    role = data.get('role', 'user')
    content = data.get('content', '')
    if role not in ('user', 'assistant'):
        return jsonify({'error': 'Invalid role'}), 400

    db.execute(
        'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)',
        [chat_id, role, content]
    )
    db.commit()
    return jsonify({'ok': True}), 201


@bp.route('/migrate', methods=['POST'])
@login_required
def migrate_chats():
    data = request.get_json() or {}
    chats = data.get('chats', [])
    db = get_db()
    imported = 0
    for chat_data in chats:
        chat_id = str(uuid.uuid4())
        title = (chat_data.get('title') or 'Imported Chat')[:100]
        messages = chat_data.get('messages', [])
        db.execute(
            'INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)',
            [chat_id, current_user.id, title]
        )
        for msg in messages:
            role = msg.get('role', '')
            content = msg.get('content', '')
            if role in ('user', 'assistant') and content:
                db.execute(
                    'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)',
                    [chat_id, role, content]
                )
        imported += 1
    db.commit()
    return jsonify({'ok': True, 'imported': imported})
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
.venv/Scripts/pytest tests/test_chats.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add chats.py tests/test_chats.py
git commit -m "feat: add chat CRUD and migrate routes"
```

---

## Task 5: Stream Route

**Files:**
- Create: `stream.py`
- Create: `tests/test_stream.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_stream.py`:

```python
from unittest.mock import patch, MagicMock


def _make_chunk(content):
    chunk = MagicMock()
    chunk.message.content = content
    return chunk


def test_stream_unauthenticated_still_works(client):
    """Logged-out users can stream — no chat_id, no DB save."""
    mock_chunks = [_make_chunk('Hello'), _make_chunk(' world')]
    with patch('stream.get_ollama_client') as mock_client_factory:
        mock_client = MagicMock()
        mock_client.chat.return_value = iter(mock_chunks)
        mock_client_factory.return_value = mock_client

        res = client.post('/api/stream', json={
            'message': 'hi',
            'history': [],
            'chat_id': None
        })
    assert res.status_code == 200
    body = res.data.decode()
    assert 'Hello' in body
    assert '[DONE]' in body


def test_stream_saves_message_when_authenticated(auth_client):
    mock_chunks = [_make_chunk('Safe'), _make_chunk(' advice')]
    with patch('stream.get_ollama_client') as mock_client_factory:
        mock_client = MagicMock()
        mock_client.chat.return_value = iter(mock_chunks)
        mock_client_factory.return_value = mock_client

        create_res = auth_client.post('/api/chats', json={'title': 'Test'})
        chat_id = create_res.get_json()['id']

        auth_client.post('/api/stream', json={
            'message': 'how do I stay safe?',
            'history': [],
            'chat_id': chat_id
        })

    chat_res = auth_client.get(f'/api/chats/{chat_id}')
    messages = chat_res.get_json()['messages']
    assert any(m['role'] == 'assistant' and 'Safe advice' in m['content'] for m in messages)


def test_stream_error_returns_error_event(client):
    with patch('stream.get_ollama_client') as mock_client_factory:
        mock_client = MagicMock()
        mock_client.chat.side_effect = Exception('Ollama offline')
        mock_client_factory.return_value = mock_client

        res = client.post('/api/stream', json={'message': 'hi', 'history': []})
    assert res.status_code == 200
    assert b'[ERROR]' in res.data


def test_stream_requires_message(client):
    res = client.post('/api/stream', json={'message': '', 'history': []})
    assert res.status_code == 400
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
.venv/Scripts/pytest tests/test_stream.py -v
```

Expected: errors about missing `stream` module.

- [ ] **Step 3: Create stream.py**

```python
import json
import ollama
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app
from flask_login import current_user
from db import get_db

bp = Blueprint('stream', __name__, url_prefix='/api')

SYSTEM_PROMPT = (
    "You are a friendly, plain-language cybersecurity advisor for Arkansas residents. "
    "Your audience includes parents, students, small business owners, and non-technical users. "
    "Give practical, actionable advice. Avoid jargon. "
    "If someone may be in immediate danger (e.g., active account compromise), "
    "tell them what to do first."
)


def get_ollama_client():
    base_url = current_app.config['OLLAMA_BASE_URL']
    return ollama.Client(host=base_url)


@bp.route('/stream', methods=['POST'])
def stream():
    data = request.get_json() or {}
    message = (data.get('message') or '').strip()
    chat_id = data.get('chat_id')
    history = data.get('history') or []
    scenario_prompt = data.get('scenario_prompt')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    system = SYSTEM_PROMPT
    if scenario_prompt:
        system = f"{SYSTEM_PROMPT}\n\n{scenario_prompt}"

    messages = [{'role': 'system', 'content': system}]
    for msg in history:
        if msg.get('role') in ('user', 'assistant') and msg.get('content'):
            messages.append({'role': msg['role'], 'content': msg['content']})
    messages.append({'role': 'user', 'content': message})

    model = current_app.config['OLLAMA_MODEL']
    is_auth = current_user.is_authenticated
    user_id = current_user.id if is_auth else None

    def generate():
        full_response = []
        try:
            client = get_ollama_client()
            for chunk in client.chat(model=model, messages=messages, stream=True):
                token = chunk.message.content
                if token:
                    full_response.append(token)
                    yield f'data: {json.dumps({"token": token})}\n\n'

            if is_auth and chat_id:
                db = get_db()
                db.execute(
                    'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)',
                    [chat_id, 'assistant', ''.join(full_response)]
                )
                db.commit()

            yield 'data: [DONE]\n\n'
        except Exception as e:
            yield f'data: [ERROR] {str(e)}\n\n'

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
.venv/Scripts/pytest tests/test_stream.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
.venv/Scripts/pytest -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add stream.py tests/test_stream.py
git commit -m "feat: add SSE stream route with Ollama integration"
```

---

## Task 6: SPA Shell + CSS

**Files:**
- Create: `static/index.html`
- Create: `static/style.css`

- [ ] **Step 1: Create static/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Arkansas Cyber Advisor</title>
  <link rel="stylesheet" href="/style.css" />
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div id="app">
    <aside id="sidebar"></aside>
    <main id="main"></main>
  </div>
  <script src="/router.js"></script>
  <script src="/api.js"></script>
  <script src="/home.js"></script>
  <script src="/auth.js"></script>
  <script src="/sidebar.js"></script>
  <script src="/chat.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create static/style.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f1117;
  --bg-2: #1a1d27;
  --bg-3: #22263a;
  --border: #2e3250;
  --text: #e2e8f0;
  --text-muted: #8892a4;
  --accent: #4f8ef7;
  --accent-hover: #6aa3ff;
  --danger: #e05252;
  --success: #52c97a;
  --sidebar-w: 260px;
}

html, body { height: 100%; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; font-size: 15px; }

#app { display: flex; height: 100vh; overflow: hidden; }

/* Sidebar */
#sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: var(--bg-2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
.sidebar-header h1 { font-size: 14px; font-weight: 700; color: var(--accent); letter-spacing: 0.05em; text-transform: uppercase; }

.sidebar-nav { padding: 8px; border-bottom: 1px solid var(--border); }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.15s; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: transparent; color: var(--text-muted); width: 100%; text-align: left; }
.btn-ghost:hover { background: var(--bg-3); color: var(--text); }
.btn-danger { background: var(--danger); color: #fff; }

.new-chat-btn { width: 100%; justify-content: center; }

.chat-list { flex: 1; overflow-y: auto; padding: 8px; }
.chat-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-item:hover, .chat-item.active { background: var(--bg-3); color: var(--text); }

.sidebar-footer { padding: 12px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-muted); }
.sidebar-footer a { color: var(--accent); text-decoration: none; }
.sidebar-footer a:hover { text-decoration: underline; }

/* Main */
#main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* Home */
.home { flex: 1; overflow-y: auto; padding: 40px 24px; max-width: 760px; margin: 0 auto; width: 100%; }
.home h2 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
.home p.subtitle { color: var(--text-muted); margin-bottom: 32px; }
.scenario-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 32px; }
.scenario-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 18px 16px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.scenario-card:hover { border-color: var(--accent); background: var(--bg-3); }
.scenario-card .icon { font-size: 24px; margin-bottom: 8px; }
.scenario-card .label { font-size: 14px; font-weight: 500; }

/* Chat view */
.chat-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }

.message { display: flex; gap: 12px; max-width: 760px; width: 100%; }
.message.user { align-self: flex-end; flex-direction: row-reverse; }
.message.assistant { align-self: flex-start; }

.bubble { padding: 12px 16px; border-radius: 12px; line-height: 1.6; font-size: 14px; max-width: 640px; }
.message.user .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 3px; }
.message.assistant .bubble { background: var(--bg-2); border: 1px solid var(--border); border-bottom-left-radius: 3px; }

.bubble p { margin-bottom: 8px; }
.bubble p:last-child { margin-bottom: 0; }
.bubble code { background: var(--bg-3); padding: 1px 5px; border-radius: 3px; font-size: 13px; }
.bubble pre { background: var(--bg-3); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
.bubble ul, .bubble ol { padding-left: 20px; margin-bottom: 8px; }

/* Reasoning block */
.reasoning-toggle { font-size: 12px; color: var(--text-muted); cursor: pointer; margin-bottom: 6px; user-select: none; }
.reasoning-toggle:hover { color: var(--text); }
.reasoning-content { font-size: 12px; color: var(--text-muted); background: var(--bg-3); border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; white-space: pre-wrap; display: none; }
.reasoning-content.open { display: block; }

/* Typing indicator */
.typing-indicator { display: flex; gap: 4px; align-items: center; padding: 12px 16px; }
.typing-indicator span { width: 7px; height: 7px; background: var(--text-muted); border-radius: 50%; animation: bounce 1.2s infinite; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }

/* Error message */
.msg-error { color: var(--danger); font-size: 13px; }
.msg-error button { margin-left: 8px; background: none; border: 1px solid var(--danger); color: var(--danger); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
.msg-error button:hover { background: var(--danger); color: #fff; }

/* Input area */
.input-area { padding: 16px; border-top: 1px solid var(--border); background: var(--bg); }
.input-row { display: flex; gap: 10px; align-items: flex-end; max-width: 760px; margin: 0 auto; }
.input-row textarea { flex: 1; resize: none; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 14px; font-family: inherit; line-height: 1.5; max-height: 160px; overflow-y: auto; }
.input-row textarea:focus { outline: none; border-color: var(--accent); }
.input-row textarea::placeholder { color: var(--text-muted); }
.send-btn { width: 40px; height: 40px; border-radius: 8px; border: none; background: var(--accent); color: #fff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.send-btn:hover { background: var(--accent-hover); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Auth pages */
.auth-page { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; }
.auth-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: 36px 32px; width: 100%; max-width: 380px; }
.auth-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 24px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px; }
.field input { width: 100%; background: var(--bg-3); border: 1px solid var(--border); border-radius: 6px; padding: 9px 12px; color: var(--text); font-size: 14px; }
.field input:focus { outline: none; border-color: var(--accent); }
.form-error { color: var(--danger); font-size: 13px; margin-bottom: 14px; }
.auth-link { text-align: center; margin-top: 16px; font-size: 13px; color: var(--text-muted); }
.auth-link a { color: var(--accent); text-decoration: none; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Responsive */
@media (max-width: 600px) {
  #sidebar { display: none; }
}
```

- [ ] **Step 3: Verify Flask serves the shell**

Start the app:
```bash
.venv/Scripts/python app.py
```

Open `http://localhost:5000` in a browser. Expected: dark page loads without JS errors in console (JS files 404 until next tasks — that's OK). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/style.css
git commit -m "feat: add SPA shell and dark theme CSS"
```

---

## Task 7: Router + API Client

**Files:**
- Create: `static/router.js`
- Create: `static/api.js`

- [ ] **Step 1: Create static/router.js**

```javascript
class Router {
  constructor() {
    this._routes = [];
    window.addEventListener('hashchange', () => this._resolve());
  }

  on(pattern, handler) {
    const keys = [];
    const src = pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    this._routes.push({ regex: new RegExp(`^${src}$`), keys, handler });
    return this;
  }

  start() {
    this._resolve();
    return this;
  }

  _resolve() {
    const path = window.location.hash.slice(1) || '/';
    for (const { regex, keys, handler } of this._routes) {
      const m = path.match(regex);
      if (m) {
        const params = {};
        keys.forEach((k, i) => { params[k] = m[i + 1]; });
        handler(params);
        return;
      }
    }
    window.location.hash = '/';
  }

  navigate(path) {
    window.location.hash = path;
  }
}
```

- [ ] **Step 2: Create static/api.js**

```javascript
// ── Backend API (authenticated) ───────────────────────────────────────────────
const API = {
  async _req(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { data, status: res.status, ok: res.ok };
  },
  get:  (path)       => API._req('GET', path),
  post: (path, body) => API._req('POST', path, body),

  me:           ()              => API.get('/api/me'),
  login:        (email, pass)   => API.post('/login', { email, password: pass }),
  register:     (email, pass)   => API.post('/register', { email, password: pass }),
  logout:       ()              => API.post('/logout'),
  listChats:    ()              => API.get('/api/chats'),
  createChat:   (title)         => API.post('/api/chats', { title }),
  getChat:      (id)            => API.get(`/api/chats/${id}`),
  addMessage:   (chatId, role, content) => API.post(`/api/chats/${chatId}/messages`, { role, content }),
  migrate:      (chats)         => API.post('/api/migrate', { chats }),
};

// ── LocalChats: localStorage store for logged-out users ───────────────────────
const LocalChats = {
  _KEY: 'ark_cyber_chats',

  all() {
    try { return JSON.parse(localStorage.getItem(this._KEY) || '[]'); }
    catch { return []; }
  },

  _save(chats) { localStorage.setItem(this._KEY, JSON.stringify(chats)); },

  create(title) {
    const chat = { id: crypto.randomUUID(), title, messages: [], created_at: new Date().toISOString() };
    const all = this.all();
    all.unshift(chat);
    this._save(all);
    return chat;
  },

  get(id) { return this.all().find(c => c.id === id) || null; },

  addMessage(chatId, role, content) {
    const all = this.all();
    const chat = all.find(c => c.id === chatId);
    if (!chat) return;
    chat.messages.push({ role, content, created_at: new Date().toISOString() });
    this._save(all);
  },

  clear() { localStorage.removeItem(this._KEY); },
};

// ── App state ─────────────────────────────────────────────────────────────────
const State = {
  user: null,        // null = logged out, object = { id, email }
  streaming: false,  // true while waiting for Ollama

  async init() {
    const { data } = await API.me();
    this.user = (data && data.id) ? data : null;
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add static/router.js static/api.js
git commit -m "feat: add SPA router and API/localStorage client"
```

---

## Task 8: Home Page

**Files:**
- Create: `static/home.js`

- [ ] **Step 1: Create static/home.js**

```javascript
const SCENARIOS = [
  { icon: '🔓', label: 'I think I got hacked', prompt: 'The user believes their account or device has been compromised. Walk them through immediate steps: secure their accounts, check for unauthorized activity, and prevent further damage. Be calm and reassuring.' },
  { icon: '🏢', label: 'Protect my small business', prompt: 'The user runs a small business in Arkansas and wants to improve their cybersecurity. Give practical, low-cost advice tailored to small businesses: backups, passwords, phishing awareness, and basic network security.' },
  { icon: '👧', label: 'My child is being targeted online', prompt: 'The user is a parent concerned about online threats to their child. Cover cyberbullying, predators, privacy settings, and how to talk with their child about online safety.' },
  { icon: '📧', label: 'I got a suspicious email', prompt: 'The user received an email they think might be phishing or a scam. Help them identify the signs of phishing, what to do (and not do), and how to report it.' },
  { icon: '🔑', label: 'Make my passwords safer', prompt: 'The user wants to improve their password hygiene. Explain password managers, strong password creation, and two-factor authentication in plain language.' },
];

function renderHome(router) {
  const el = document.createElement('div');
  el.className = 'home';
  el.innerHTML = `
    <h2>Arkansas Cyber Advisor</h2>
    <p class="subtitle">Free cybersecurity guidance for every Arkansas resident — no technical background needed.</p>
    <div class="scenario-grid">
      ${SCENARIOS.map((s, i) => `
        <div class="scenario-card" data-i="${i}">
          <div class="icon">${s.icon}</div>
          <div class="label">${s.label}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-primary new-chat-btn" id="home-new-chat">Start a new conversation</button>
  `;

  el.querySelectorAll('.scenario-card').forEach(card => {
    card.addEventListener('click', () => {
      const scenario = SCENARIOS[parseInt(card.dataset.i)];
      startScenarioChat(scenario, router);
    });
  });

  el.querySelector('#home-new-chat').addEventListener('click', () => {
    router.navigate('/chat');
  });

  return el;
}

async function startScenarioChat(scenario, router) {
  if (State.user) {
    const { data } = await API.createChat(scenario.label);
    if (data?.id) {
      sessionStorage.setItem('pending_scenario', scenario.prompt);
      router.navigate(`/chat/${data.id}`);
    }
  } else {
    const chat = LocalChats.create(scenario.label);
    sessionStorage.setItem('pending_scenario', scenario.prompt);
    router.navigate(`/chat/${chat.id}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add static/home.js
git commit -m "feat: add home page with scenario cards"
```

---

## Task 9: Auth Pages

**Files:**
- Create: `static/auth.js`

- [ ] **Step 1: Create static/auth.js**

```javascript
function renderLogin(router) {
  const el = document.createElement('div');
  el.className = 'auth-page';
  el.innerHTML = `
    <div class="auth-card">
      <h2>Sign In</h2>
      <div class="form-error" id="login-error" style="display:none"></div>
      <div class="field"><label>Email</label><input type="email" id="login-email" autocomplete="email" /></div>
      <div class="field"><label>Password</label><input type="password" id="login-pass" autocomplete="current-password" /></div>
      <button class="btn btn-primary" style="width:100%" id="login-btn">Sign In</button>
      <div class="auth-link">No account? <a href="#/register">Create one</a></div>
    </div>
  `;

  const emailEl = el.querySelector('#login-email');
  const passEl  = el.querySelector('#login-pass');
  const errEl   = el.querySelector('#login-error');
  const btn     = el.querySelector('#login-btn');

  async function doLogin() {
    errEl.style.display = 'none';
    btn.disabled = true;
    const { data, status } = await API.login(emailEl.value.trim(), passEl.value);
    btn.disabled = false;
    if (status === 200) {
      State.user = data;
      await maybeMigrate();
      router.navigate('/');
    } else {
      errEl.textContent = data?.error || 'Login failed';
      errEl.style.display = 'block';
    }
  }

  btn.addEventListener('click', doLogin);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  return el;
}

function renderRegister(router) {
  const el = document.createElement('div');
  el.className = 'auth-page';
  el.innerHTML = `
    <div class="auth-card">
      <h2>Create Account</h2>
      <div class="form-error" id="reg-error" style="display:none"></div>
      <div class="field"><label>Email</label><input type="email" id="reg-email" autocomplete="email" /></div>
      <div class="field"><label>Password <span style="color:var(--text-muted);font-size:12px">(min 8 characters)</span></label><input type="password" id="reg-pass" autocomplete="new-password" /></div>
      <button class="btn btn-primary" style="width:100%" id="reg-btn">Create Account</button>
      <div class="auth-link">Already have an account? <a href="#/login">Sign in</a></div>
    </div>
  `;

  const emailEl = el.querySelector('#reg-email');
  const passEl  = el.querySelector('#reg-pass');
  const errEl   = el.querySelector('#reg-error');
  const btn     = el.querySelector('#reg-btn');

  async function doRegister() {
    errEl.style.display = 'none';
    btn.disabled = true;
    const { data, status } = await API.register(emailEl.value.trim(), passEl.value);
    btn.disabled = false;
    if (status === 201) {
      State.user = data;
      await maybeMigrate();
      router.navigate('/');
    } else {
      errEl.textContent = data?.error || 'Registration failed';
      errEl.style.display = 'block';
    }
  }

  btn.addEventListener('click', doRegister);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  return el;
}

async function maybeMigrate() {
  const localChats = LocalChats.all();
  if (localChats.length === 0) return;
  await API.migrate(localChats);
  LocalChats.clear();
}
```

- [ ] **Step 2: Commit**

```bash
git add static/auth.js
git commit -m "feat: add login and register pages with migration on login"
```

---

## Task 10: Sidebar

**Files:**
- Create: `static/sidebar.js`

- [ ] **Step 1: Create static/sidebar.js**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add static/sidebar.js
git commit -m "feat: add sidebar with chat list and auth footer"
```

---

## Task 11: Chat View + Streaming + Reasoning Blocks

**Files:**
- Create: `static/chat.js`

- [ ] **Step 1: Create static/chat.js**

```javascript
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
        router.navigate(`/chat/${activeChatId}`);
      } else {
        const chat = LocalChats.create(title);
        activeChatId = chat.id;
        router.navigate(`/chat/${activeChatId}`);
      }
      chatId = activeChatId;
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

    // Stream
    const { bubble, thinkingEl, mainEl } = appendStreamingMessage(messagesEl, typingEl);
    scrollToBottom(messagesEl);

    let fullContent = '';
    let thinkContent = '';
    let inThink = false;

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
            showStreamError(bubble, payload.slice(7).trim(), () => sendMessage());
            break;
          }
          try {
            const { token } = JSON.parse(payload);
            fullContent += token;
            // Detect <think>...</think>
            const processed = processThinkTags(fullContent);
            if (processed.thinking) thinkingEl.textContent = processed.thinking;
            mainEl.innerHTML = marked.parse(processed.main || '');
          } catch {}
        }
        scrollToBottom(messagesEl);
      }
    } catch (err) {
      showStreamError(bubble, 'Could not reach the AI. Please try again.', () => {
        history.pop();
        sendMessage();
      });
    }

    if (!State.user) {
      LocalChats.addMessage(activeChatId, 'assistant', fullContent);
    }
    history.push({ role: 'assistant', content: fullContent });

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

  const thinkBlock = document.createElement('div');
  const toggleEl   = document.createElement('div');
  toggleEl.className = 'reasoning-toggle';
  toggleEl.textContent = '▶ Show reasoning';
  toggleEl.style.display = 'none';
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'reasoning-content';

  toggleEl.addEventListener('click', () => {
    const open = thinkingEl.classList.toggle('open');
    toggleEl.textContent = open ? '▼ Hide reasoning' : '▶ Show reasoning';
  });

  // Show toggle only when there's thinking content
  const observer = new MutationObserver(() => {
    if (thinkingEl.textContent.trim()) toggleEl.style.display = 'block';
  });
  observer.observe(thinkingEl, { characterData: true, childList: true, subtree: true });

  thinkBlock.appendChild(toggleEl);
  thinkBlock.appendChild(thinkingEl);
  bubble.appendChild(thinkBlock);

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
```

- [ ] **Step 2: Commit**

```bash
git add static/chat.js
git commit -m "feat: add chat view with streaming, reasoning blocks, and error retry"
```

---

## Task 12: App Entry Point — Wire Everything Together

**Files:**
- Create: `static/app.js`

- [ ] **Step 1: Create static/app.js**

```javascript
(async () => {
  await State.init();

  const router = new Router();

  router
    .on('/', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderHome(router));
    })
    .on('/chat', () => {
      renderSidebar(router, null);
      renderChat(router, null, null);
    })
    .on('/chat/:id', ({ id }) => {
      const scenario = sessionStorage.getItem('pending_scenario') || null;
      sessionStorage.removeItem('pending_scenario');
      renderSidebar(router, id);
      renderChat(router, id, scenario);
    })
    .on('/login', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderLogin(router));
    })
    .on('/register', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderRegister(router));
    })
    .start();
})();
```

- [ ] **Step 2: Commit**

```bash
git add static/app.js
git commit -m "feat: add app entry point and wire up all routes"
```

---

## Task 13: Smoke Test + Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd "C:/Users/drewd/OneDrive - Ouachita Baptist University/arkansas-cyber-advisor"
.venv/Scripts/pytest -v
```

Expected: all tests PASS.

- [ ] **Step 2: Start the server**

```bash
.venv/Scripts/python app.py
```

Expected: `Running on http://127.0.0.1:5000`

- [ ] **Step 3: Manual smoke test checklist**

Open `http://localhost:5000` in a browser and verify:

- [ ] Home page loads with 5 scenario cards
- [ ] "Start a new conversation" navigates to `#/chat`
- [ ] Typing a message and pressing Enter shows a typing indicator
- [ ] Response streams in token by token
- [ ] If model output contains `<think>…</think>`, a "Show reasoning" toggle appears
- [ ] `#/register` — create an account, redirects to home
- [ ] `#/login` — sign in works
- [ ] After login, past localStorage chats migrate to the account
- [ ] Sidebar shows chat list, clicking a chat loads its history
- [ ] Clicking a scenario card starts a pre-seeded chat
- [ ] Sign out clears the session

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete Arkansas Cyber Advisor MVP"
```
