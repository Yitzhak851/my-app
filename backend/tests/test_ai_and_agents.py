"""
The AI layer and the world simulation (requirements 2.c and 2.d).
"""
import random

import pytest

from app.services.agent_service import AgentService
from app.services.ai import get_provider, sentiment
from app.services.ai.personalities import AGENTS


# ─────────────────────────────────────────────────────── sentiment ──────────

@pytest.mark.parametrize('text', [
    'you are an idiot',
    'kill yourself',
    'shut up you pathetic loser',
    'nobody likes you',
])
def test_hostility_is_flagged(text):
    assert sentiment.analyze(text)['is_toxic'] is True


@pytest.mark.parametrize('text', [
    'The deployment failed again and it is awful',
    'This library is terrible and the docs are the worst',
    'I hate how slow this build is',
    'A perfectly ordinary post about indexes',
    '',
])
def test_negativity_alone_is_not_flagged(text):
    """
    The distinction the whole feature depends on.

    Complaining about software is not abuse. If frustration counted as
    toxicity, the moderation queue would fill with ordinary posts and stop
    being useful — the failure mode is a queue nobody reads, not a missed word.
    """
    assert sentiment.analyze(text)['is_toxic'] is False


def test_positive_text_scores_positive():
    assert sentiment.analyze('This is great, thanks — really helpful')['score'] > 0


def test_markup_is_ignored_when_scoring():
    plain = sentiment.analyze('you are an idiot')
    marked = sentiment.analyze('<p>you are an <strong>idiot</strong></p>')
    assert marked['is_toxic'] == plain['is_toxic']


def test_the_reason_for_a_flag_is_reported():
    """A moderator needs to know why, not just that."""
    assert 'idiot' in sentiment.analyze('what an idiot')['matches']


# ───────────────────────────────────────────────────── writing help ─────────

def test_autocorrect_fixes_common_typos():
    result = get_provider().autocorrect('Teh enviroment definately dont work')

    assert 'The environment definitely' in result['corrected']
    assert {'from': 'Teh', 'to': 'The'} in result['changes']


def test_autocorrect_keeps_capitalisation():
    assert get_provider().autocorrect('Teh cat')['corrected'].startswith('The')


def test_autocorrect_reports_every_change_it_made():
    """Nothing is altered silently — the writer sees what was touched."""
    result = get_provider().autocorrect('teh adn thier')
    assert len(result['changes']) == 3


def test_autocorrect_on_clean_text_changes_nothing():
    result = get_provider().autocorrect('This sentence is already correct.')
    assert result['changes'] == []


def test_autocorrect_handles_empty_input():
    assert get_provider().autocorrect('')['corrected'] == ''


def test_suggestions_follow_the_tone_of_the_post():
    provider = get_provider()
    upbeat = provider.suggest_comments({'title': 'This is wonderful and helpful', 'body': 'great'})
    unhappy = provider.suggest_comments({'title': 'Everything is broken and terrible', 'body': 'awful'})

    assert upbeat != unhappy
    assert len(upbeat) == 3


# ────────────────────────────────────────────────────────── agents ──────────

def test_there_are_at_least_ten_agents():
    """Requirement 2.d asks for at least 10."""
    assert len(AGENTS) >= 10


def test_every_agent_has_a_distinct_personality():
    personalities = [a['personality'] for a in AGENTS]
    assert len(set(personalities)) == len(personalities)
    assert all(len(p) > 30 for p in personalities)


def test_personality_drives_what_an_agent_writes():
    """Same call, same seed, different voice — the personality is doing work."""
    provider = get_provider()
    optimist = provider.generate_post(AGENTS[0]['personality'], seed=1)
    skeptic = provider.generate_post(AGENTS[1]['personality'], seed=1)

    assert optimist['title'] != skeptic['title']
    assert optimist['body'] != skeptic['body']


def test_generation_is_reproducible_for_a_given_seed():
    provider = get_provider()
    first = provider.generate_post(AGENTS[0]['personality'], seed=99)
    second = provider.generate_post(AGENTS[0]['personality'], seed=99)
    assert first == second


def test_an_unknown_personality_still_produces_something():
    """The fallback path: reduced quality, never a crash."""
    draft = get_provider().generate_post('a personality nobody defined')
    assert draft['title'] and draft['body']


def test_agents_are_seeded_once(db, app):
    with app.app_context():
        created = AgentService.ensure_seeded()
        assert created == len(AGENTS)
        assert AgentService.ensure_seeded() == 0
        assert len(AgentService.list_agents()) >= 10


def test_a_tick_produces_activity(db, app):
    with app.app_context():
        AgentService.ensure_seeded()
        human = db.add_user(email='human@example.com', name='Human')
        db.add_post(human, title='something to react to')

        before = (len(db.posts), len(db.comments), len(db.likes))
        for i in range(20):
            AgentService.tick(random.Random(i))
        after = (len(db.posts), len(db.comments), len(db.likes))

        assert after != before, 'twenty ticks should have changed something'


def test_agents_engage_with_other_peoples_posts(db, app):
    """An agent replying to itself is noise, not a simulation."""
    with app.app_context():
        AgentService.ensure_seeded()
        agents = {a['id'] for a in AgentService.list_agents()}
        human = db.add_user(email='human@example.com')
        db.add_post(human, title='a human post')

        for i in range(30):
            AgentService.tick(random.Random(i))

        for comment in db.comments.values():
            if comment['user_id'] in agents:
                assert db.posts[comment['post_id']]['user_id'] != comment['user_id']


def test_agent_content_is_scored_like_anyone_elses(db, app):
    with app.app_context():
        AgentService.ensure_seeded()
        db.add_post(db.add_user(email='human@example.com'), title='seed post')

        for i in range(15):
            AgentService.tick(random.Random(i))

        written = [p for p in db.posts.values() if p.get('sentiment_score') is not None]
        assert written, 'agent posts should carry a sentiment score'


def test_a_tick_never_raises(db, app, monkeypatch):
    """It runs on a timer with nobody watching; a crash must not kill the loop."""
    with app.app_context():
        monkeypatch.setattr(
            AgentService, 'list_agents',
            staticmethod(lambda: (_ for _ in ()).throw(RuntimeError('database gone')))
        )
        assert AgentService.tick() is None
