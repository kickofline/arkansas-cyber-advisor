import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DATABASE = os.environ.get('DATABASE', 'cyber_advisor.db')
    OLLAMA_HOST = os.environ.get('OLLAMA_URL', 'localhost')
    OLLAMA_BASE_URL = f"http://{os.environ.get('OLLAMA_URL', 'localhost')}:11434"
    OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'gpt-oss:20b')
    TESTING = False

class TestConfig(Config):
    TESTING = True
    DATABASE = ':memory:'
    SECRET_KEY = 'test-secret'
    WTF_CSRF_ENABLED = False
