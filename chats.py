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


@bp.route('/chats/<chat_id>', methods=['PATCH'])
@login_required
def update_chat(chat_id):
    db = get_db()
    if not db.execute(
        'SELECT id FROM chats WHERE id = ? AND user_id = ?', [chat_id, current_user.id]
    ).fetchone():
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    title = (data.get('title') or '')[:100]
    if title:
        db.execute('UPDATE chats SET title = ? WHERE id = ?', [title, chat_id])
        db.commit()
    return jsonify({'ok': True})


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
