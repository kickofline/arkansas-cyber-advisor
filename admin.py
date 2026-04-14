import os
from functools import wraps
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from db import get_db

bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def require_admin(f):
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        admin_emails = current_app.config.get('ADMIN_EMAILS', [])
        if current_user.email.lower() not in admin_emails:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated


# ── Public ────────────────────────────────────────────────────────────────────

@bp.route('/public/prompts', methods=['GET'])
def public_prompts():
    """Returns active admin_prompts for the chat UI. Empty = use JS defaults."""
    db = get_db()
    rows = db.execute(
        'SELECT icon, label, text FROM admin_prompts WHERE active=1 ORDER BY position, id'
    ).fetchall()
    return jsonify([dict(r) for r in rows])


# ── Settings ──────────────────────────────────────────────────────────────────

@bp.route('/settings', methods=['GET'])
@require_admin
def get_settings():
    db = get_db()
    rows = db.execute('SELECT key, value FROM settings').fetchall()
    return jsonify({r['key']: r['value'] for r in rows})


@bp.route('/settings', methods=['POST'])
@require_admin
def update_settings():
    data = request.get_json() or {}
    db = get_db()
    for key, value in data.items():
        db.execute(
            'INSERT INTO settings (key, value) VALUES (?, ?) '
            'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
            [key, str(value)]
        )
    db.commit()
    return jsonify({'ok': True})


# ── Prompts ───────────────────────────────────────────────────────────────────

@bp.route('/prompts', methods=['GET'])
@require_admin
def list_prompts():
    db = get_db()
    rows = db.execute(
        'SELECT id, icon, label, text, position, active FROM admin_prompts ORDER BY position, id'
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@bp.route('/prompts', methods=['POST'])
@require_admin
def create_prompt():
    data = request.get_json() or {}
    label = (data.get('label') or '').strip()
    text  = (data.get('text') or '').strip()
    if not label or not text:
        return jsonify({'error': 'label and text required'}), 400
    db = get_db()
    db.execute(
        'INSERT INTO admin_prompts (icon, label, text, position) VALUES (?, ?, ?, ?)',
        [data.get('icon', '🔒'), label, text, int(data.get('position', 0))]
    )
    db.commit()
    return jsonify({'ok': True}), 201


@bp.route('/prompts/<int:prompt_id>', methods=['PUT'])
@require_admin
def update_prompt(prompt_id):
    data = request.get_json() or {}
    db = get_db()
    db.execute(
        'UPDATE admin_prompts SET icon=?, label=?, text=?, position=?, active=? WHERE id=?',
        [
            data.get('icon', '🔒'),
            (data.get('label') or '').strip(),
            (data.get('text') or '').strip(),
            int(data.get('position', 0)),
            1 if data.get('active', True) else 0,
            prompt_id,
        ]
    )
    db.commit()
    return jsonify({'ok': True})


@bp.route('/prompts/<int:prompt_id>', methods=['DELETE'])
@require_admin
def delete_prompt(prompt_id):
    db = get_db()
    db.execute('DELETE FROM admin_prompts WHERE id=?', [prompt_id])
    db.commit()
    return jsonify({'ok': True})
