from flask import Blueprint, request, jsonify
from flask_login import UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from db import get_db

bp = Blueprint('auth', __name__)


class User(UserMixin):
    def __init__(self, id, email):
        self.id = id
        self.email = email


def load_user(user_id):
    db = get_db()
    row = db.execute('SELECT id, email FROM users WHERE id = ?', [user_id]).fetchone()
    if row is None:
        return None
    return User(row['id'], row['email'])


@bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    db = get_db()
    if db.execute('SELECT id FROM users WHERE email = ?', [email]).fetchone():
        return jsonify({'error': 'Email already registered'}), 409

    db.execute(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        [email, generate_password_hash(password)]
    )
    db.commit()

    row = db.execute('SELECT id, email FROM users WHERE email = ?', [email]).fetchone()
    login_user(User(row['id'], row['email']))
    return jsonify({'id': row['id'], 'email': row['email']}), 201


@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    db = get_db()
    row = db.execute(
        'SELECT id, email, password_hash FROM users WHERE email = ?', [email]
    ).fetchone()
    if row is None or not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Invalid email or password'}), 401

    login_user(User(row['id'], row['email']))
    return jsonify({'id': row['id'], 'email': row['email']})


@bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'ok': True})


@bp.route('/api/me')
def me():
    if current_user.is_authenticated:
        return jsonify({'id': current_user.id, 'email': current_user.email})
    return jsonify({'user': None})
