import os
from functools import wraps
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from db import get_db

bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def _admin_emails_set():
    """Union of env-var admins and DB-stored admins."""
    env_set = set(current_app.config.get('ADMIN_EMAILS', []))
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key='admin_emails'").fetchone()
    db_set = set(
        e.strip().lower()
        for e in (row['value'] if row else '').split('\n')
        if e.strip()
    )
    return env_set | db_set


def require_admin(f):
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if current_user.email.lower() not in _admin_emails_set():
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


# ── Documents ─────────────────────────────────────────────────────────────────

@bp.route('/documents', methods=['GET'])
@require_admin
def list_documents():
    db = get_db()
    rows = db.execute(
        'SELECT id, filename, mimetype, active, created_at FROM documents ORDER BY created_at DESC'
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@bp.route('/documents', methods=['POST'])
@require_admin
def upload_document():
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'No file provided'}), 400

    filename = file.filename
    mimetype = file.content_type or ''

    if filename.lower().endswith('.pdf') or 'pdf' in mimetype:
        try:
            import pypdf
            reader = pypdf.PdfReader(file)
            content = '\n\n'.join(
                (page.extract_text() or '') for page in reader.pages
            )
        except Exception as e:
            return jsonify({'error': f'PDF parse error: {e}'}), 422
    else:
        try:
            content = file.read().decode('utf-8', errors='replace')
        except Exception as e:
            return jsonify({'error': f'Read error: {e}'}), 422

    content = content[:50_000]  # cap per-document

    db = get_db()
    db.execute(
        'INSERT INTO documents (filename, mimetype, content) VALUES (?, ?, ?)',
        [filename, mimetype, content]
    )
    db.commit()
    return jsonify({'ok': True}), 201


@bp.route('/documents/<int:doc_id>', methods=['PATCH'])
@require_admin
def toggle_document(doc_id):
    db = get_db()
    db.execute('UPDATE documents SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?', [doc_id])
    db.commit()
    return jsonify({'ok': True})


@bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@require_admin
def delete_document(doc_id):
    db = get_db()
    db.execute('DELETE FROM documents WHERE id=?', [doc_id])
    db.commit()
    return jsonify({'ok': True})


# ── Admins ────────────────────────────────────────────────────────────────────

@bp.route('/admins', methods=['GET'])
@require_admin
def get_admins():
    env_admins = sorted(current_app.config.get('ADMIN_EMAILS', []))
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key='admin_emails'").fetchone()
    db_admins = [
        e.strip().lower()
        for e in (row['value'] if row else '').split('\n')
        if e.strip()
    ]
    return jsonify({'env_admins': env_admins, 'db_admins': db_admins})


@bp.route('/admins', methods=['POST'])
@require_admin
def save_admins():
    data = request.get_json() or {}
    emails = [e.strip().lower() for e in (data.get('emails') or []) if e.strip()]
    db = get_db()
    db.execute(
        'INSERT INTO settings (key, value) VALUES (?, ?) '
        'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
        ['admin_emails', '\n'.join(emails)]
    )
    db.commit()
    return jsonify({'ok': True})
