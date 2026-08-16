import hashlib
import secrets
from datetime import datetime, timedelta

from flask import current_app

from app.services.auth_service import AuthService
from app.services.mail_service import MailService
from app.services.session_service import SessionService
from app.utils.db import Database


class PasswordResetService:
    """
    Password reset by emailed link (course requirement 2.a.i).

    Two decisions worth stating:

    1. Only the SHA-256 of the token is stored. The plaintext exists in one
       place — the email — and nowhere else. Someone who steals a database dump
       cannot use it to reset anyone's password. SHA-256 rather than bcrypt is
       right here: the token is 256 bits of randomness, so there is nothing to
       brute-force, and the lookup must be fast.

    2. Requesting a reset for an unknown address returns exactly the same
       response as a known one. Anything else turns the form into a way to test
       whether an address has an account here.
    """

    TTL_MINUTES = 30
    TOKEN_BYTES = 32

    @staticmethod
    def _hash(token):
        return hashlib.sha256(token.encode('utf-8')).hexdigest()

    @staticmethod
    def request_reset(email):
        """Always succeeds from the caller's point of view."""
        normalized = (email or '').strip().lower()
        if not normalized:
            return {'success': True}

        user = Database.execute_query(
            "SELECT id, email, name FROM users WHERE email = %s AND is_banned = FALSE",
            (normalized,),
            fetch_one=True,
        )
        if not user:
            return {'success': True}

        # Any earlier link for this account stops working the moment a new one
        # is issued, so a forwarded old email cannot be used later.
        Database.execute_update(
            "DELETE FROM password_resets WHERE user_id = %s", (user['id'],)
        )

        token = secrets.token_urlsafe(PasswordResetService.TOKEN_BYTES)
        expires_at = datetime.now() + timedelta(minutes=PasswordResetService.TTL_MINUTES)

        Database.execute_update(
            """
            INSERT INTO password_resets (token_hash, user_id, expires_at)
            VALUES (%s, %s, %s)
            """,
            (PasswordResetService._hash(token), user['id'], expires_at),
        )

        frontend = current_app.config['FRONTEND_URL'].rstrip('/')
        link = f'{frontend}/reset-password?token={token}'

        MailService.send(
            to=user['email'],
            subject='Reset your YBO Social Network password',
            body=(
                f"Hello {user['name'] or ''},\n\n"
                f"Use this link to choose a new password:\n\n    {link}\n\n"
                f"The link expires in {PasswordResetService.TTL_MINUTES} minutes "
                f"and can be used once.\n\n"
                "If you did not ask for this, you can ignore this message — your "
                "password has not changed.\n"
            ),
        )
        return {'success': True}

    @staticmethod
    def reset(token, new_password):
        """Consume a token and set the new password."""
        if not token:
            return {'success': False, 'error': 'This reset link is not valid', 'status': 400}

        problem = AuthService.validate_password(new_password)
        if problem:
            return {'success': False, 'error': problem, 'status': 400}

        row = Database.execute_query(
            """
            SELECT token_hash, user_id, expires_at, used_at
            FROM password_resets
            WHERE token_hash = %s
            """,
            (PasswordResetService._hash(token),),
            fetch_one=True,
        )

        # One message for every failure mode. Telling the difference between
        # "expired", "already used" and "never existed" is information an
        # attacker can use and a legitimate user does not need.
        invalid = {
            'success': False,
            'error': 'This reset link is not valid or has expired',
            'status': 400,
        }
        if not row or row['used_at'] is not None or row['expires_at'] <= datetime.now():
            return invalid

        Database.execute_update(
            "UPDATE users SET password = %s WHERE id = %s",
            (AuthService.hash_password(new_password), row['user_id']),
        )

        # Single use.
        Database.execute_update(
            "UPDATE password_resets SET used_at = NOW() WHERE token_hash = %s",
            (row['token_hash'],),
        )

        # Whoever knew the old password — including anyone who had stolen a
        # session — is signed out. Resetting a password that someone else knows
        # is pointless if their session survives it.
        SessionService.destroy_all_for_user(row['user_id'])

        return {'success': True}
