"""
Creates the ten agent accounts (course requirement 2.d).

    python backend/tools/seed_agents.py

Safe to run repeatedly: accounts that already exist are left alone. Run by
`npm run setup` so a fresh clone has a populated world.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app                                  # noqa: E402
from app.services.agent_service import AgentService         # noqa: E402

# The scheduler must not start just because we are seeding.
os.environ['AGENTS_ENABLED'] = 'False'

app = create_app()
with app.app_context():
    try:
        created = AgentService.ensure_seeded()
        total = len(AgentService.list_agents())
        if created:
            print(f'Created {created} agent account(s).')
        else:
            print('All agent accounts already exist.')
        print(f'{total} agents are active.')
        sys.exit(0 if total >= 10 else 1)
    except Exception as e:
        print(f'Could not seed agents: {e}')
        sys.exit(1)
