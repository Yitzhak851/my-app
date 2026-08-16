import smtplib
from email.message import EmailMessage

from flask import current_app


class MailService:
    """
    Sends mail, or convincingly pretends to.

    A course project has no mail server, and requiring one would mean nobody
    could run the password-reset flow. So the transport is configurable:

      console  (default)  print the message to the server log
      file                append it to a file, handy for tests
      smtp                a real server, configured through .env

    The flow above this layer is identical in all three, so switching to real
    mail later is a config change, not a code change.
    """

    @staticmethod
    def send(to, subject, body):
        backend = current_app.config.get('MAIL_BACKEND', 'console')

        if backend == 'smtp':
            return MailService._send_smtp(to, subject, body)
        if backend == 'file':
            return MailService._send_file(to, subject, body)
        return MailService._send_console(to, subject, body)

    # ------------------------------------------------------------------ dev --
    @staticmethod
    def _send_console(to, subject, body):
        print('\n' + '=' * 70)
        print(f'  EMAIL (not actually sent — MAIL_BACKEND=console)')
        print(f'  To:      {to}')
        print(f'  Subject: {subject}')
        print('-' * 70)
        print(body)
        print('=' * 70 + '\n', flush=True)
        return True

    @staticmethod
    def _send_file(to, subject, body):
        path = current_app.config.get('MAIL_FILE_PATH', 'sent_mail.log')
        with open(path, 'a', encoding='utf-8') as fh:
            fh.write(f'To: {to}\nSubject: {subject}\n\n{body}\n{"-" * 60}\n')
        return True

    # ----------------------------------------------------------------- real --
    @staticmethod
    def _send_smtp(to, subject, body):
        message = EmailMessage()
        message['From'] = current_app.config['MAIL_FROM']
        message['To'] = to
        message['Subject'] = subject
        message.set_content(body)

        host = current_app.config['MAIL_HOST']
        port = int(current_app.config['MAIL_PORT'])
        username = current_app.config.get('MAIL_USERNAME')
        password = current_app.config.get('MAIL_PASSWORD')

        with smtplib.SMTP(host, port, timeout=10) as smtp:
            if current_app.config.get('MAIL_USE_TLS', True):
                smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return True
