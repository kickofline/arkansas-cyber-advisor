import os
from dotenv import load_dotenv

load_dotenv()

_ollama_host = os.environ.get('OLLAMA_URL', 'localhost')

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DATABASE = os.environ.get('DATABASE', 'cyber_advisor.db')
    OLLAMA_HOST = _ollama_host
    OLLAMA_BASE_URL = f'http://{_ollama_host}:11434'
    OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'gpt-oss:20b')
    TESTING = False

class TestConfig(Config):
    TESTING = True
    DATABASE = ':memory:'
    SECRET_KEY = 'test-secret'
    WTF_CSRF_ENABLED = False
