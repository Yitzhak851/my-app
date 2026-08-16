"""
Writing help powered by the AI layer (course requirement 2.c).

Every endpoint here is a suggestion the person can ignore. Nothing rewrites
anyone's text on their behalf, and nothing blocks publishing — the sentiment
check marks content for review rather than refusing it.
"""
from flask import Blueprint, current_app, jsonify, request

from app.services.ai import get_provider
from app.utils.auth import login_required
from app.utils.db import Database

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')

MAX_INPUT = 5000


def _provider():
    return get_provider(current_app.config.get('AI_PROVIDER', 'local'))


@ai_bp.route('/autocorrect', methods=['POST'])
@login_required
def autocorrect():
    """Suggest spelling fixes. Returns both the text and what changed."""
    try:
        text = (request.get_json(silent=True) or {}).get('text', '')
        if len(text) > MAX_INPUT:
            return jsonify({'error': 'That text is too long to check'}), 400

        result = _provider().autocorrect(text)
        return jsonify(result), 200
    except Exception:
        # A writing aid must never stop someone from writing.
        return jsonify({'corrected': '', 'changes': [], 'error': 'Suggestions unavailable'}), 200


@ai_bp.route('/generate-post', methods=['POST'])
@login_required
def generate_post():
    """Draft a post to start from."""
    try:
        data = request.get_json(silent=True) or {}
        draft = _provider().generate_post(data.get('style'))
        return jsonify(draft), 200
    except Exception:
        return jsonify({'error': 'Could not generate a draft'}), 500


@ai_bp.route('/suggest-comments/<int:post_id>', methods=['GET'])
@login_required
def suggest_comments(post_id):
    """Reply suggestions shaped by the post's own tone."""
    try:
        post = Database.execute_query(
            "SELECT id, title, body FROM posts WHERE id = %s", (post_id,), fetch_one=True
        )
        if not post:
            return jsonify({'error': 'Post not found'}), 404

        return jsonify({'suggestions': _provider().suggest_comments(post)}), 200
    except Exception:
        # Falling back to nothing is correct: no suggestions beats a broken UI.
        return jsonify({'suggestions': []}), 200


@ai_bp.route('/analyze', methods=['POST'])
@login_required
def analyze():
    """
    Score text before it is published, so the writer sees the warning first.

    Advisory only — the same check runs server-side when the content is
    actually created, because this endpoint can simply be skipped.
    """
    try:
        text = (request.get_json(silent=True) or {}).get('text', '')
        return jsonify(_provider().analyze_sentiment(text[:MAX_INPUT])), 200
    except Exception:
        return jsonify({'score': 0.0, 'is_toxic': False, 'matches': []}), 200
