import os
import uuid

from flask import current_app

# Extensions we are willing to store AND serve back to a browser.
#
# SVG is deliberately absent: an SVG is a document that can carry <script>, so
# serving a user-uploaded one from our own origin would be a stored XSS hole.
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}

# First bytes of each format we accept. Checking these means a file is judged by
# what it contains, not by what the uploader chose to call it.
MAGIC_SIGNATURES = (
    (b'\x89PNG\r\n\x1a\n', 'png'),
    (b'\xff\xd8\xff', 'jpeg'),
    (b'GIF87a', 'gif'),
    (b'GIF89a', 'gif'),
)

MAX_BYTES = 5 * 1024 * 1024  # 5 MB


class UploadError(Exception):
    """Something about the uploaded file is not acceptable."""


def _looks_like_an_image(head):
    """True if the leading bytes match a format we accept."""
    for signature, _ in MAGIC_SIGNATURES:
        if head.startswith(signature):
            return True
    # WEBP is "RIFF" .... "WEBP"
    return head[:4] == b'RIFF' and head[8:12] == b'WEBP'


class UploadService:
    """Stores uploaded images on disk and returns a URL for them."""

    @staticmethod
    def upload_dir():
        path = current_app.config['UPLOAD_FOLDER']
        os.makedirs(path, exist_ok=True)
        return path

    @staticmethod
    def save_image(file_storage):
        """
        Validate and store an uploaded image. Returns the stored filename.

        Raises UploadError with a message meant for the person uploading.
        """
        if file_storage is None or not file_storage.filename:
            raise UploadError('No file was uploaded')

        ext = os.path.splitext(file_storage.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            allowed = ', '.join(sorted(e.lstrip('.') for e in ALLOWED_EXTENSIONS))
            raise UploadError(f'Unsupported file type. Allowed: {allowed}')

        head = file_storage.stream.read(16)
        file_storage.stream.seek(0)
        if not _looks_like_an_image(head):
            raise UploadError('That file is not a valid image')

        # Size is enforced by MAX_CONTENT_LENGTH before we get here, but a
        # stream can still be measured cheaply, so check rather than assume.
        file_storage.stream.seek(0, os.SEEK_END)
        size = file_storage.stream.tell()
        file_storage.stream.seek(0)
        if size == 0:
            raise UploadError('The file is empty')
        if size > MAX_BYTES:
            raise UploadError(f'The image is larger than {MAX_BYTES // (1024 * 1024)} MB')

        # The client's filename is never used for the stored name. It could
        # contain path separators, be a duplicate, or be crafted to overwrite
        # something. A random name removes all of that at once.
        stored_name = f'{uuid.uuid4().hex}{ext}'
        file_storage.save(os.path.join(UploadService.upload_dir(), stored_name))
        return stored_name
