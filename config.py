import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY          = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DATABASE            = os.environ.get('DATABASE', 'cyber_advisor.db')
    OLLAMA_BASE_URL     = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
    OLLAMA_MODEL        = os.environ.get('OLLAMA_MODEL', 'skynet')
    OLLAMA_NUM_CTX      = int(os.environ.get('OLLAMA_NUM_CTX', 16384))
    OLLAMA_NUM_PARALLEL = int(os.environ.get('OLLAMA_NUM_PARALLEL', 4))
    TESTING             = False
    MAX_CONTENT_LENGTH  = 50 * 1024 * 1024  # 50 MB request ceiling for image uploads
    TEAMS_WEBHOOK_URL   = os.environ.get('TEAMS_WEBHOOK_URL', '')
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
