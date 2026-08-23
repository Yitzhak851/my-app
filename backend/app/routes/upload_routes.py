from flask import Blueprint, jsonify, request, send_from_directory, url_for
from werkzeug.exceptions import HTTPException

from app.services.upload_service import UploadError, UploadService
from app.utils.auth import login_required

upload_bp = Blueprint('uploads', __name__)


@upload_bp.route('/api/uploads/image', methods=['POST'])
@login_required
def upload_image():
    """
    Accept one image and return the URL it can be fetched from.

    Kept separate from post creation so the post endpoint stays plain JSON:
    the client uploads first, then sends the returned URL as image_url.
    """
    try:
        stored_name = UploadService.save_image(request.files.get('image'))
    except UploadError as e:
        return jsonify({'error': str(e)}), 400
    except HTTPException:
        # Werkzeug raises these for things it already has a correct status for —
        # notably 413 when the body exceeds MAX_CONTENT_LENGTH, which is thrown
        # the moment request.files parses the stream. Swallowing it here would
        # report "server error" for what is really "your file is too big".
        raise
    except Exception:
        return jsonify({'error': 'Could not save the image'}), 500

    # A root-relative path, NOT an absolute URL.
    #
    # This value is stored in the database with the post, so an absolute URL
    # bakes the hostname in permanently: every image uploaded while developing
    # is saved as http://localhost:5000/... and is broken the moment the app is
    # deployed anywhere else. A relative path follows the app to any domain.
    #
    # It resolves in development too: the Vite dev server proxies
    # /static/uploads to the API (see frontend/vite.config.js), and in
    # production nginx serves the same path from disk.
    return jsonify({
        'url': url_for('uploads.serve_upload', filename=stored_name),
        'filename': stored_name,
    }), 201


@upload_bp.route('/static/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    """
    Serve a stored image.

    send_from_directory refuses paths that escape the directory, so a filename
    like ../../etc/passwd cannot be used to read arbitrary files.
    """
    from flask import current_app
    return send_from_directory(
        current_app.config['UPLOAD_FOLDER'],
        filename,
        max_age=60 * 60 * 24 * 30,  # uploads are immutable: the name is random
    )
