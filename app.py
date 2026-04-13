from flask import Flask
from config import Config


def create_app(config=None):
    app = Flask(__name__, static_folder='static', static_url_path='')
    app.config.from_object(Config)
    if config:
        app.config.update(config)

    from db import init_app as init_db_app
    init_db_app(app)

    from flask_login import LoginManager
    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        from flask import jsonify
        return jsonify({'error': 'Authentication required'}), 401

    from auth import bp as auth_bp, load_user
    login_manager.user_loader(load_user)
    app.register_blueprint(auth_bp)

    from chats import bp as chats_bp
    app.register_blueprint(chats_bp)

    from stream import bp as stream_bp
    app.register_blueprint(stream_bp)

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        return app.send_static_file('index.html')

    return app


if __name__ == '__main__':
    import os
    app = create_app()
    app.run(debug=os.environ.get('FLASK_DEBUG', '').lower() == 'true', port=5000)
