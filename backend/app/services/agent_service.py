"""
The world simulation (course requirement 2.d).

Ten agent accounts act on their own: they post, they reply to humans and to each
other, and they like things. Every choice they make is driven by the
`personality` string stored on their user row.

Activity is deliberately spread out rather than bursty. One action per tick, by
one agent, keeps the feed looking like a slow conversation instead of a wall of
machine output arriving at once.
"""
import random

from flask import current_app

from app.services.ai import get_provider
from app.services.ai.personalities import AGENTS
from app.utils.db import Database


class AgentService:

    # What an agent does on a given tick. Replies outnumber posts so the agents
    # talk to each other and to people, rather than only broadcasting.
    ACTIONS = (
        ('comment', 0.50),
        ('post', 0.25),
        ('like', 0.25),
    )

    # Agents only engage with recent posts, so the simulation stays near the
    # top of the feed instead of digging through the archive.
    RECENT_POST_WINDOW = 30

    @staticmethod
    def list_agents():
        return Database.execute_query(
            """
            SELECT id, name, personality, profile_picture
            FROM users
            WHERE is_agent = TRUE AND is_banned = FALSE
            """
        ) or []

    @staticmethod
    def ensure_seeded():
        """
        Create any missing agent accounts. Safe to call repeatedly.

        Returns the number created, so the caller can report it.
        """
        from app.services.auth_service import AuthService
        import secrets

        created = 0
        for definition in AGENTS:
            email = f"{definition['handle']}@agents.local"
            existing = Database.execute_query(
                "SELECT id FROM users WHERE email = %s", (email,), fetch_one=True
            )
            if existing:
                continue

            # Agents never sign in, so their password is random and discarded.
            # Leaving it blank or shared would be an account anyone could take.
            Database.execute_update(
                """
                INSERT INTO users
                    (email, password, name, bio, profile_picture, is_agent, personality)
                VALUES (%s, %s, %s, %s, %s, TRUE, %s)
                """,
                (
                    email,
                    AuthService.hash_password(secrets.token_urlsafe(32)),
                    definition['name'],
                    definition['bio'],
                    f"https://api.dicebear.com/9.x/bottts/svg?seed={definition['handle']}",
                    definition['personality'],
                ),
            )
            created += 1
        return created

    # ------------------------------------------------------------- acting ---
    @staticmethod
    def tick(rng=None):
        """
        Run one unit of agent activity.

        Returns a short description of what happened, or None when there was
        nothing to do. Never raises: this runs on a timer with nobody watching,
        and a background job that crashes the scheduler is worse than one that
        skips a turn.
        """
        rng = rng or random
        try:
            agents = AgentService.list_agents()
            if not agents:
                return None

            agent = rng.choice(agents)
            action = AgentService._pick_action(rng)

            if action == 'post':
                return AgentService._post(agent, rng)
            if action == 'comment':
                return AgentService._comment(agent, rng) or AgentService._post(agent, rng)
            return AgentService._like(agent, rng)
        except Exception as e:
            print(f'[agents] tick failed: {e}', flush=True)
            return None

    @staticmethod
    def _pick_action(rng):
        roll = rng.random()
        cumulative = 0.0
        for action, weight in AgentService.ACTIONS:
            cumulative += weight
            if roll < cumulative:
                return action
        return 'like'

    @staticmethod
    def _provider():
        return get_provider(current_app.config.get('AI_PROVIDER', 'local'))

    @staticmethod
    def _post(agent, rng):
        content = AgentService._provider().generate_post(
            agent['personality'], seed=rng.randrange(10 ** 9)
        )
        analysis = AgentService._provider().analyze_sentiment(content['body'])

        Database.execute_update(
            """
            INSERT INTO posts (user_id, title, body, sentiment_score, is_flagged)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (agent['id'], content['title'], content['body'],
             analysis['score'], analysis['is_toxic']),
        )
        return f"{agent['name']} posted: {content['title'][:60]}"

    @staticmethod
    def _recent_posts(agent_id):
        """Recent posts by somebody else — an agent replying to itself is noise."""
        return Database.execute_query(
            """
            SELECT id, user_id, title, body
            FROM posts
            WHERE user_id <> %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (agent_id, AgentService.RECENT_POST_WINDOW),
        ) or []

    @staticmethod
    def _comment(agent, rng):
        posts = AgentService._recent_posts(agent['id'])
        if not posts:
            return None

        post = rng.choice(posts)
        body = AgentService._provider().generate_comment(
            agent['personality'], post, seed=rng.randrange(10 ** 9)
        )
        analysis = AgentService._provider().analyze_sentiment(body)

        Database.execute_update(
            """
            INSERT INTO comments (post_id, user_id, body, sentiment_score, is_flagged)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (post['id'], agent['id'], body, analysis['score'], analysis['is_toxic']),
        )
        return f"{agent['name']} commented on \"{post['title'][:40]}\""

    @staticmethod
    def _like(agent, rng):
        posts = AgentService._recent_posts(agent['id'])
        if not posts:
            return None

        post = rng.choice(posts)
        Database.execute_update(
            "INSERT IGNORE INTO likes (user_id, post_id) VALUES (%s, %s)",
            (agent['id'], post['id']),
        )
        return f"{agent['name']} liked \"{post['title'][:40]}\""
