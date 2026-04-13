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

    def generate():
        full_response = []
        try:
            client = get_ollama_client()
            for chunk in client.chat(model=model, messages=messages, stream=True):
                token = chunk.message.content
                if token:
                    full_response.append(token)
                    yield f'data: {json.dumps({"token": token})}\n\n'

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
