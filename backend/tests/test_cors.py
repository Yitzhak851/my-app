"""
The CORS preflight.

The frontend runs on :5173 and the API on :5000, so every request that is not a
simple GET is preflighted. A verb missing from the allow-list produces the worst
kind of failure: the server is healthy, the endpoint works from curl, the unit
tests pass, and nothing appears in the log — the browser simply refuses to send
the request.

That is exactly what happened to PATCH. The allow-list read
`["GET", "POST", "PUT", "DELETE", "OPTIONS"]` — PUT, which no route uses, and no
PATCH, which /api/moderation/reports/<id> does. The symptom was "the Dismiss
button in the moderation dashboard does nothing".

So this file does not check a hard-coded list. It reads the verbs the app's own
URL map declares and requires each one to be allowed, which means the next verb
someone adds is covered without anyone remembering to come back here.
"""
import pytest

ORIGIN = 'http://localhost:5173'


def api_methods(app):
    """Every HTTP verb the API's own routes declare."""
    verbs = set()
    for rule in app.url_map.iter_rules():
        if rule.rule.startswith('/api/'):
            verbs |= (rule.methods - {'HEAD', 'OPTIONS'})
    return verbs


def preflight(client, path, method):
    return client.options(path, headers={
        'Origin': ORIGIN,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'content-type',
    })


def allowed_methods(response):
    header = response.headers.get('Access-Control-Allow-Methods', '')
    return {m.strip().upper() for m in header.split(',') if m.strip()}


def test_the_app_uses_the_verbs_this_file_expects(app):
    """Guards the test itself: if the API grows a verb, the list below grows."""
    assert api_methods(app) == {'GET', 'POST', 'PATCH', 'DELETE'}


def test_every_verb_the_api_uses_survives_a_preflight(app, client, db):
    """
    The regression test for the Dismiss button. A verb the routes declare but
    CORS does not allow is unreachable from the browser and only from the
    browser — which is why it survived a green test suite.
    """
    missing = []
    for verb in sorted(api_methods(app)):
        response = preflight(client, '/api/posts/', verb)
        if verb not in allowed_methods(response):
            missing.append(verb)

    assert not missing, f'the browser cannot send: {", ".join(missing)}'


def test_the_moderation_patch_endpoint_is_reachable_from_the_browser(client, db):
    response = preflight(client, '/api/moderation/reports/1', 'PATCH')

    assert response.status_code in (200, 204)
    assert 'PATCH' in allowed_methods(response)


@pytest.mark.parametrize('path', [
    '/api/posts/',
    '/api/auth/login',
    '/api/follows/',
    '/api/reports',
    '/api/moderation/users/2/ban',
])
def test_the_session_cookie_is_allowed_on_cross_origin_calls(client, db, path):
    """
    Without Allow-Credentials the browser sends the request but drops the
    session cookie, and the API sees every signed-in person as anonymous.
    """
    response = preflight(client, path, 'POST')

    assert response.headers.get('Access-Control-Allow-Credentials') == 'true'
    assert response.headers.get('Access-Control-Allow-Origin') == ORIGIN


def test_an_unknown_origin_is_not_allowed(client, db):
    """
    Allow-Credentials forbids a wildcard origin, so the list must be real —
    and must not quietly echo back whatever asks.
    """
    response = client.options('/api/posts/', headers={
        'Origin': 'http://evil.example.com',
        'Access-Control-Request-Method': 'POST',
    })

    assert response.headers.get('Access-Control-Allow-Origin') != 'http://evil.example.com'


def test_content_type_is_an_allowed_header(client, db):
    """Sending JSON is what makes a request preflighted in the first place."""
    response = preflight(client, '/api/posts/', 'POST')
    allowed = {h.strip().lower()
               for h in response.headers.get('Access-Control-Allow-Headers', '').split(',')}

    assert 'content-type' in allowed


def test_both_url_forms_answer_without_a_redirect(client, db):
    """
    /api/posts and /api/posts/ must both be the endpoint itself. Flask's default
    308 to the trailing-slash form is fatal after a preflight: the fetch spec
    forbids following a redirect there, and the request dies in the browser as
    an opaque "TypeError: Failed to fetch".
    """
    for path in ('/api/posts', '/api/posts/'):
        assert client.get(path).status_code == 200, path
        assert client.post(path, json={'title': 't', 'body': 'b'}).status_code != 308, path
