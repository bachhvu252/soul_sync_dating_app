"""
app/__init__.py — Flask application factory.

Creates and configures the Flask app.
Usage:
    flask run --port 5001
    # or
    python -m flask --app app run --port 5001
"""

import os
from flask import Flask
from dotenv import load_dotenv

load_dotenv(dotenv_path="../../.env.local", override=False)


def create_app() -> Flask:
    app = Flask(__name__)

    # Max upload size: 10 MB
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    # Local uploads directory
    uploads_dir = os.path.abspath(os.getenv("UPLOADS_DIR", "./uploads"))
    os.makedirs(uploads_dir, exist_ok=True)
    app.config["UPLOADS_DIR"] = uploads_dir

    # Internal secret for service-to-service validation
    app.config["INTERNAL_API_SECRET"] = os.getenv("INTERNAL_API_SECRET", "")

    # Register blueprints
    from app.routes.media import media_bp
    app.register_blueprint(media_bp)

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "soulsync-flask"}

    return app


# Expose app instance for `flask run`
app = create_app()
