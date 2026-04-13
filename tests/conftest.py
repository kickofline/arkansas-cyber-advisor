import pytest
from app import create_app


@pytest.fixture
def app():
    application = create_app({'TESTING': True, 'DATABASE': ':memory:', 'SECRET_KEY': 'test'})
    yield application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_client(client):
    """Returns a client already registered and logged in."""
    client.post('/register', json={'email': 'test@example.com', 'password': 'password123'})
    return client
