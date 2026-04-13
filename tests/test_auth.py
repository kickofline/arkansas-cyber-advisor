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
