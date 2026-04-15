import uuid
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

    # Validate all files before writing anything to DB
    validated = []
    for file in files:
        if not file or not file.filename:
            continue
        mimetype = file.content_type or ''
        if not mimetype.startswith('image/'):
            return jsonify({'error': f'{file.filename} is not an image'}), 400
        data = file.read()
        if len(data) > _MAX_SIZE:
            return jsonify({'error': f'{file.filename} exceeds 5 MB limit'}), 400
        validated.append((file.filename, mimetype, data))

    db = get_db()
    _cleanup_old_images(db)

    ids = []
    for filename, mimetype, data in validated:
        img_id = str(uuid.uuid4())
        db.execute(
            'INSERT INTO message_images (id, filename, mimetype, data) VALUES (?, ?, ?, ?)',
            [img_id, filename, mimetype, data]
        )
        ids.append(img_id)

    db.commit()
    return jsonify({'ids': ids}), 201


@bp.route('/images/<image_id>', methods=['GET'])
def serve_image(image_id):
    db = get_db()
    row = db.execute(
        'SELECT data, mimetype FROM message_images WHERE id = ?', [image_id]
    ).fetchone()
    if row is None:
        return jsonify({'error': 'Not found'}), 404
    return Response(bytes(row['data']), content_type=row['mimetype'])
