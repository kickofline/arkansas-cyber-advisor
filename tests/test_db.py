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
