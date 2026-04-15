import base64
import json
import uuid
import ollama
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app
from flask_login import current_user
from db import get_db

bp = Blueprint('stream', __name__, url_prefix='/api')

_DEFAULT_SYSTEM_PROMPT = (
    "You are a friendly, plain-language cybersecurity advisor for Arkansas residents. "
    "Your audience includes parents, students, small business owners, and non-technical users. "
    "Give practical, actionable advice. Avoid jargon. "
    "If someone may be in immediate danger (e.g., active account compromise), "
    "tell them what to do first."
)

# Tool definition exposed to the model
_SEARCH_TOOL = {
    'type': 'function',
    'function': {
        'name': 'search_documents',
        'description': (
            'Search the reference document library for relevant cybersecurity guidance, '
            'policies, or local resources. Call this when the user asks something that '
            'may be covered by specific reference material in the library.'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'query': {
                    'type': 'string',
                    'description': 'A short, focused search query (e.g. "password manager recommendations").',
                }
            },
            'required': ['query'],
        },
    },
}

_STOP_WORDS = {
    'the','a','an','is','are','was','were','be','been','have','has',
    'do','does','did','will','would','could','should','may','might',
    'i','you','we','they','it','my','your','our','their','what','how',
    'why','when','where','who','which','that','this','these','those',
    'and','or','but','in','on','at','to','for','of','with','by',
    'from','about','not','no','can',
}


def _get_system_prompt():
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key='system_prompt'").fetchone()
    return row['value'] if (row and row['value']) else _DEFAULT_SYSTEM_PROMPT


def _has_active_documents():
    db = get_db()
    return db.execute("SELECT 1 FROM documents WHERE active=1 LIMIT 1").fetchone() is not None


def _search_documents(query, top_k=5):
    """Keyword-scored paragraph search over active documents."""
    db = get_db()
    docs = db.execute(
        "SELECT filename, content FROM documents WHERE active=1"
    ).fetchall()
    if not docs:
        return []
    words = set(query.lower().split())
    q_words = words - _STOP_WORDS or words  # fall back to all words if all are stop words
    if not q_words:
        return []
    scored = []
    for doc in docs:
        paras = [p.strip() for p in doc['content'].split('\n\n') if len(p.strip()) > 40]
        for para in paras:
            score = sum(1 for w in q_words if w in para.lower())
            if score > 0:
                scored.append((score, doc['filename'], para[:1000]))
    scored.sort(reverse=True)
    return scored[:top_k]


def get_ollama_client():
    base_url = current_app.config['OLLAMA_BASE_URL']
    return ollama.Client(host=base_url)


@bp.route('/title', methods=['POST'])
def generate_title():
    data    = request.get_json() or {}
    message = (data.get('message') or '').strip()[:300]
    if not message:
        return jsonify({'title': ''}), 200
    try:
        client = get_ollama_client()
        model  = current_app.config['OLLAMA_MODEL']
        num_ctx      = current_app.config['OLLAMA_NUM_CTX']
        num_parallel = current_app.config['OLLAMA_NUM_PARALLEL']
        res    = client.chat(
            model=model,
            messages=[{
                'role': 'user',
                'content': (
                    'Write a short title (3–5 words) for this conversation exchange. '
                    'Reply with the title only — no quotes, no punctuation at the end.\n\n'
                    f'{message}'
                ),
            }],
            stream=False,
            think=True,
            keep_alive='24h',
            options={'num_ctx': num_ctx, 'num_parallel': num_parallel},
        )
        title = (res.message.content or '').strip().strip('"\'').rstrip('.')[:80]
        return jsonify({'title': title}), 200
    except Exception:
        return jsonify({'title': ''}), 200


@bp.route('/stream', methods=['POST'])
def stream():
    data    = request.get_json() or {}
    message = (data.get('message') or '').strip()
    chat_id = data.get('chat_id')
    history   = data.get('history') or []
    image_ids = [i for i in (data.get('image_ids') or []) if isinstance(i, str) and i]
    if not message and not image_ids:
        return jsonify({'error': 'Message or image is required'}), 400

    system = _get_system_prompt()
    messages = [{'role': 'system', 'content': system}]
    for msg in history:
        if msg.get('role') in ('user', 'assistant') and msg.get('content'):
            messages.append({'role': msg['role'], 'content': msg['content']})
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

    model        = current_app.config['OLLAMA_MODEL']
    num_ctx      = current_app.config['OLLAMA_NUM_CTX']
    num_parallel = current_app.config['OLLAMA_NUM_PARALLEL']
    is_auth      = current_user.is_authenticated
    has_docs     = _has_active_documents()

    # Link images to the user message row immediately, before streaming begins.
    # API.addMessage (called by the client before this request) has already committed
    # the user message, so the latest user row is the correct one.
    if is_auth and chat_id and image_ids:
        db = get_db()
        user_row = db.execute(
            'SELECT id FROM messages WHERE chat_id=? AND role=? ORDER BY id DESC LIMIT 1',
            [chat_id, 'user']
        ).fetchone()
        if user_row:
            for img_id in image_ids:
                db.execute(
                    'UPDATE message_images SET message_id=? WHERE id=?',
                    [user_row['id'], img_id]
                )
            db.commit()

    def generate():
        full_response = []
        try:
            client = get_ollama_client()
            chat_messages = list(messages)
            # ── Tool-use loop ─────────────────────────────────────────────
            # Only runs when there are active documents AND the message is long
            # enough to plausibly need reference material. Short/conversational
            # messages skip the pre-check entirely to reduce TTFT.
            _needs_rag = has_docs and len(message.split()) >= 5
            if _needs_rag:
                for _ in range(3):
                    try:
                        resp = client.chat(
                            model=model,
                            messages=chat_messages,
                            tools=[_SEARCH_TOOL],
                            stream=False,
                            think=False,
                            keep_alive='24h',
                            options={'num_ctx': num_ctx, 'num_parallel': num_parallel},
                        )
                    except Exception:
                        # Model doesn't support tools — skip to streaming pass
                        break

                    if not resp.message.tool_calls:
                        # No more tool calls — fall through to streaming pass
                        break

                    # Execute each tool call the model requested
                    chat_messages.append(resp.message)
                    for tc in resp.message.tool_calls:
                        if tc.function.name == 'search_documents':
                            query   = tc.function.arguments.get('query', '')
                            results = _search_documents(query)
                            result_text = (
                                '\n\n'.join(
                                    f'[{fname}]:\n{chunk}'
                                    for _, fname, chunk in results
                                )
                                if results else 'No relevant documents found.'
                            )
                            chat_messages.append({'role': 'tool', 'content': result_text})

            # ── Streaming pass ────────────────────────────────────────────
            # Runs when: no docs, tool loop failed/exhausted, or tool results
            # were gathered and we need to stream the final answer.
            for chunk in client.chat(
                model=model,
                messages=chat_messages,
                stream=True,
                think=True,
                keep_alive='24h',
                options={'num_ctx': num_ctx, 'num_parallel': num_parallel},
            ):
                thinking = chunk.message.thinking
                content  = chunk.message.content
                if thinking:
                    yield f'data: {json.dumps({"thinking_token": thinking})}\n\n'
                if content:
                    full_response.append(content)
                    yield f'data: {json.dumps({"token": content})}\n\n'

            if is_auth and chat_id and full_response:
                db = get_db()
                db.execute(
                    'INSERT INTO messages (id, chat_id, role, content) VALUES (?, ?, ?, ?)',
                    [str(uuid.uuid4()), chat_id, 'assistant', ''.join(full_response)]
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
