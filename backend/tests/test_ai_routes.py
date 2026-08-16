"""
The writing-help endpoints (requirement 2.c).

The design rule these tests enforce: **a writing aid must never stop someone
from writing.** Every endpoint here is optional help, so a failure downstream
has to degrade into "no suggestions" rather than an error the composer has to
deal with. The one thing that is *not* optional is the session check — these
endpoints do work on the server's behalf and are not open to the public.
"""
import pytest

from app.routes import ai_routes
from app.services.ai import LocalProvider
from app.utils.db import Database


ENDPOINTS = [
    ('post', '/api/ai/autocorrect', {'text': 'teh'}),
    ('post', '/api/ai/generate-post', {}),
    ('get', '/api/ai/suggest-comments/1', None),
    ('post', '/api/ai/analyze', {'text': 'hello'}),
]


# ────────────────────────────────────────────────────── access control ───────

@pytest.mark.parametrize('method,url,payload', ENDPOINTS)
def test_every_ai_endpoint_needs_a_session(client, db, method, url, payload):
    call = getattr(client, method)
    res = call(url, json=payload) if payload is not None else call(url)

    assert res.status_code == 401


# ───────────────────────────────────────────────────────── autocorrect ───────

def test_autocorrect_returns_the_fixed_text_and_what_changed(client, signed_in):
    res = client.post('/api/ai/autocorrect', json={'text': 'teh cat dont care'})

    assert res.status_code == 200
    assert res.json['corrected'] == "the cat don't care"
    assert {c['from'] for c in res.json['changes']} == {'teh', 'dont'}


def test_autocorrect_leaves_correct_text_alone(client, signed_in):
    res = client.post('/api/ai/autocorrect', json={'text': 'the cat is fine'})

    assert res.json['corrected'] == 'the cat is fine'
    assert res.json['changes'] == []


def test_autocorrect_preserves_capitalisation(client, signed_in):
    res = client.post('/api/ai/autocorrect', json={'text': 'Teh start. TEH end.'})

    assert 'The start.' in res.json['corrected']
    assert 'THE end.' in res.json['corrected']


def test_autocorrect_on_empty_input_is_not_an_error(client, signed_in):
    res = client.post('/api/ai/autocorrect', json={'text': ''})

    assert res.status_code == 200
    assert res.json['corrected'] == ''


def test_autocorrect_refuses_text_that_is_too_long(client, signed_in):
    res = client.post('/api/ai/autocorrect', json={'text': 'a' * (ai_routes.MAX_INPUT + 1)})

    assert res.status_code == 400


def test_autocorrect_degrades_to_no_suggestions_when_the_provider_breaks(
        client, signed_in, monkeypatch):
    """The composer must stay usable even if this feature is broken."""
    def explode(self, _text):
        raise RuntimeError('model unavailable')

    monkeypatch.setattr(LocalProvider, 'autocorrect', explode)

    res = client.post('/api/ai/autocorrect', json={'text': 'teh'})

    assert res.status_code == 200
    assert res.json['changes'] == []


# ─────────────────────────────────────────────────────── generate a post ────

def test_generate_post_returns_a_title_and_a_body(client, signed_in):
    res = client.post('/api/ai/generate-post', json={})

    assert res.status_code == 200
    assert res.json['title']
    assert res.json['body'].startswith('<p>')


def test_generate_post_works_with_no_json_body_at_all(client, signed_in):
    res = client.post('/api/ai/generate-post')

    assert res.status_code == 200
    assert res.json['title']


def test_generate_post_reports_a_failure_it_cannot_hide(client, signed_in, monkeypatch):
    """
    Unlike the others this one has no useful degraded form — an empty draft
    would look like the button silently did nothing.
    """
    def explode(self, _style):
        raise RuntimeError('model unavailable')

    monkeypatch.setattr(LocalProvider, 'generate_post', explode)

    assert client.post('/api/ai/generate-post', json={}).status_code == 500


# ────────────────────────────────────────────────────── suggest comments ────

def test_suggestions_are_returned_for_an_existing_post(client, db, signed_in):
    post_id = db.add_post(signed_in, title='A good day', body='Everything worked.')

    res = client.get(f'/api/ai/suggest-comments/{post_id}')

    assert res.status_code == 200
    assert len(res.json['suggestions']) == 3


def test_suggestions_for_a_missing_post_are_a_404(client, db, signed_in):
    res = client.get('/api/ai/suggest-comments/999999')

    assert res.status_code == 404


def test_suggestions_follow_the_tone_of_the_post(client, db, signed_in):
    """A post about something going wrong should not get three cheerful replies."""
    happy = db.add_post(signed_in, title='Great news', body='This is wonderful and helpful.')
    sad = db.add_post(signed_in, title='Broken again', body='This is terrible and broken.')

    happy_replies = client.get(f'/api/ai/suggest-comments/{happy}').json['suggestions']
    sad_replies = client.get(f'/api/ai/suggest-comments/{sad}').json['suggestions']

    assert happy_replies != sad_replies


def test_a_database_failure_degrades_to_no_suggestions(client, db, signed_in, monkeypatch):
    post_id = db.add_post(signed_in)
    working = db.execute_query

    def explode(sql, params=None, fetch_one=False):
        # Only the post lookup fails; the session must still resolve, otherwise
        # this would be testing the 401 path by accident.
        if 'FROM posts' in sql:
            raise RuntimeError('connection lost')
        return working(sql, params, fetch_one)

    monkeypatch.setattr(Database, 'execute_query', staticmethod(explode))

    res = client.get(f'/api/ai/suggest-comments/{post_id}')

    assert res.status_code == 200
    assert res.json['suggestions'] == []


# ─────────────────────────────────────────────────────────────── analyze ────

def test_analyze_scores_friendly_text_as_not_toxic(client, signed_in):
    res = client.post('/api/ai/analyze', json={'text': 'This is wonderful, thank you'})

    assert res.status_code == 200
    assert res.json['is_toxic'] is False
    assert res.json['score'] > 0


def test_analyze_flags_an_actual_insult(client, signed_in):
    res = client.post('/api/ai/analyze', json={'text': 'you are an idiot'})

    assert res.json['is_toxic'] is True
    assert res.json['matches']


def test_analyze_does_not_flag_frustration_aimed_at_a_thing(client, signed_in):
    """
    The regression that mattered: "the deployment failed again and it is awful"
    is negative, but nobody is being attacked. Flagging it would have sent
    ordinary complaints to the moderation queue.
    """
    res = client.post('/api/ai/analyze', json={'text': 'the deployment failed again and it is awful'})

    assert res.json['score'] < 0
    assert res.json['is_toxic'] is False


def test_analyze_truncates_rather_than_refusing_long_text(client, signed_in):
    """The composer calls this while typing; a 400 mid-sentence is not useful."""
    res = client.post('/api/ai/analyze', json={'text': 'ok ' * 5000})

    assert res.status_code == 200


def test_analyze_degrades_to_a_neutral_score_on_failure(client, signed_in, monkeypatch):
    def explode(self, _text):
        raise RuntimeError('model unavailable')

    monkeypatch.setattr(LocalProvider, 'analyze_sentiment', explode)

    res = client.post('/api/ai/analyze', json={'text': 'anything'})

    assert res.status_code == 200
    assert res.json == {'score': 0.0, 'is_toxic': False, 'matches': []}


# ─────────────────────────────────────────────── provider configuration ─────

def test_an_unknown_provider_name_falls_back_to_the_local_one(client, app, signed_in):
    """
    A typo in AI_PROVIDER must not take the feature down — falling back with
    reduced capability is the point of having a provider interface.
    """
    app.config['AI_PROVIDER'] = 'some-model-that-does-not-exist'

    res = client.post('/api/ai/autocorrect', json={'text': 'teh'})

    assert res.status_code == 200
    assert res.json['corrected'] == 'the'
