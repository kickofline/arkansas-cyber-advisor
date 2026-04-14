import json
import re
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


def _get_system_prompt():
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key='system_prompt'").fetchone()
    return row['value'] if (row and row['value']) else _DEFAULT_SYSTEM_PROMPT


_STOP_WORDS = {
    'the','a','an','is','are','was','were','be','been','have','has',
    'do','does','did','will','would','could','should','may','might',
    'i','you','we','they','it','my','your','our','their','what','how',
    'why','when','where','who','which','that','this','these','those',
    'and','or','but','in','on','at','to','for','of','with','by',
    'from','about','not','no','can',
}


def _search_documents(query, top_k=5):
    db = get_db()
    docs = db.execute(
        "SELECT filename, content FROM documents WHERE active=1"
    ).fetchall()
    if not docs:
        return []
    q_words = set(query.lower().split()) - _STOP_WORDS
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
        res    = client.chat(
            model=model,
            messages=[{
                'role': 'user',
                'content': (
                    'Write a short title (3–5 words) for a conversation that begins with this message. '
                    'Reply with the title only — no quotes, no punctuation at the end.\n\n'
                    f'Message: {message}'
                ),
            }],
            stream=False,
            think=True,
            keep_alive='30m',
            options={'num_ctx': 512},
        )
        title = (res.message.content or '').strip().strip('"\'').rstrip('.')[:80]
        return jsonify({'title': title}), 200
    except Exception as e:
        return jsonify({'title': ''}), 200


@bp.route('/stream', methods=['POST'])
def stream():
    data = request.get_json() or {}
    message = (data.get('message') or '').strip()
    chat_id = data.get('chat_id')
    history = data.get('history') or []
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    system = _get_system_prompt()

    messages = [{'role': 'system', 'content': system}]
    for msg in history:
        if msg.get('role') in ('user', 'assistant') and msg.get('content'):
            messages.append({'role': msg['role'], 'content': msg['content']})
    doc_chunks = _search_documents(message)
    if doc_chunks:
        context = '\n\n'.join(
            f'[{fname}]:\n{chunk}' for _, fname, chunk in doc_chunks
        )
        messages.append({
            'role': 'system',
            'content': f'Relevant reference material for this query:\n\n{context}',
        })
    messages.append({'role': 'user', 'content': message})

    model = current_app.config['OLLAMA_MODEL']
    is_auth = current_user.is_authenticated

    def generate():
        full_response = []
        try:
            client = get_ollama_client()
            for chunk in client.chat(
                model=model,
                messages=messages,
                stream=True,
                think=True,
                keep_alive='30m',
                options={'num_ctx': 2048},
            ):
                thinking = chunk.message.thinking
                content  = chunk.message.content
                if thinking:
                    yield f'data: {json.dumps({"thinking_token": thinking})}\n\n'
                if content:
                    full_response.append(content)
                    yield f'data: {json.dumps({"token": content})}\n\n'

            # DB write happens AFTER all tokens are yielded
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
