"""
Image upload (course requirement 1.e: create a post with text AND image).

The risky part of accepting files is not the happy path — it is everything a
client can send that is not a normal image.
"""
import io
import os

import pytest

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 64
GIF = b'GIF89a' + b'\x00' * 64


@pytest.fixture
def uploads_dir(app, tmp_path):
    app.config['UPLOAD_FOLDER'] = str(tmp_path)
    return tmp_path


def send(client, data, filename, field='image'):
    return client.post(
        '/api/uploads/image',
        data={field: (io.BytesIO(data), filename)},
        content_type='multipart/form-data',
    )


def test_uploading_requires_a_session(client, uploads_dir):
    assert send(client, PNG, 'a.png').status_code == 401


def test_a_png_is_accepted_and_gets_a_url(client, signed_in, uploads_dir):
    res = send(client, PNG, 'photo.png')

    assert res.status_code == 201
    assert res.json['url'].endswith(res.json['filename'])
    assert '/static/uploads/' in res.json['url']
    assert (uploads_dir / res.json['filename']).exists()


@pytest.mark.parametrize('data,name', [(PNG, 'a.png'), (JPEG, 'a.jpg'), (GIF, 'a.gif')])
def test_the_common_image_formats_are_accepted(client, signed_in, uploads_dir, data, name):
    assert send(client, data, name).status_code == 201


def test_the_stored_name_is_random_not_the_uploaded_one(client, signed_in, uploads_dir):
    """A client-chosen name could contain a path, or overwrite another file."""
    res = send(client, PNG, 'photo.png')

    stored = res.json['filename']
    assert stored != 'photo.png'
    assert stored.endswith('.png')
    assert len(stored) > 20


def test_two_uploads_of_the_same_name_do_not_collide(client, signed_in, uploads_dir):
    first = send(client, PNG, 'same.png').json['filename']
    second = send(client, PNG, 'same.png').json['filename']

    assert first != second
    assert len(os.listdir(uploads_dir)) == 2


def test_a_path_traversal_filename_cannot_escape_the_folder(client, signed_in, uploads_dir):
    res = send(client, PNG, '../../evil.png')

    assert res.status_code == 201
    stored = res.json['filename']
    assert '/' not in stored and '\\' not in stored and '..' not in stored
    assert (uploads_dir / stored).exists()


def test_an_executable_disguised_as_an_image_is_rejected(client, signed_in, uploads_dir):
    """Right extension, wrong contents — the bytes decide."""
    res = send(client, b'#!/bin/sh\nrm -rf /\n', 'payload.png')

    assert res.status_code == 400
    assert 'not a valid image' in res.json['error'].lower()
    assert os.listdir(uploads_dir) == []


def test_an_svg_is_rejected(client, signed_in, uploads_dir):
    """SVG can contain <script>; serving one from our origin would be stored XSS."""
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

    res = send(client, svg, 'x.svg')

    assert res.status_code == 400
    assert os.listdir(uploads_dir) == []


def test_a_non_image_extension_is_rejected(client, signed_in, uploads_dir):
    assert send(client, PNG, 'notes.txt').status_code == 400
    assert send(client, PNG, 'script.php').status_code == 400
    assert os.listdir(uploads_dir) == []


def test_an_empty_file_is_rejected(client, signed_in, uploads_dir):
    assert send(client, b'', 'empty.png').status_code == 400


def test_a_missing_file_field_is_rejected(client, signed_in, uploads_dir):
    res = client.post('/api/uploads/image', data={}, content_type='multipart/form-data')
    assert res.status_code == 400


def test_an_oversized_upload_is_refused(client, signed_in, uploads_dir, app):
    app.config['MAX_CONTENT_LENGTH'] = 1024
    res = send(client, PNG + b'\x00' * 4096, 'big.png')
    assert res.status_code == 413
