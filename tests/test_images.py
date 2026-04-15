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
    from werkzeug.datastructures import MultiDict
    data = MultiDict([
        ('files[]', (io.BytesIO(b'img1'), 'a.png', 'image/png')),
        ('files[]', (io.BytesIO(b'img2'), 'b.jpeg', 'image/jpeg')),
    ])
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
