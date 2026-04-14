import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY          = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DATABASE            = os.environ.get('DATABASE', 'cyber_advisor.db')
    OLLAMA_BASE_URL     = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
    OLLAMA_MODEL        = os.environ.get('OLLAMA_MODEL', 'skynet')
    TESTING             = False
    ADMIN_EMAILS        = [
        e.strip().lower()
        for e in os.environ.get('ADMIN_EMAILS', '').split(',')
        if e.strip()
    ]

    # Cookie security — set FLASK_ENV=production in prod
    _prod = os.environ.get('FLASK_ENV') == 'production'
    SESSION_COOKIE_SECURE   = _prod
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

class TestConfig(Config):
    TESTING = True
    DATABASE = ':memory:'
    SECRET_KEY = 'test-secret'
    WTF_CSRF_ENABLED = False
