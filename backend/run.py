import os
from dotenv import load_dotenv
from app import create_app

# Load environment variables
load_dotenv()

# Create Flask app
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))

    # debug must never be hardcoded on: Werkzeug's interactive debugger allows arbitrary
    # code execution for anyone who can reach the port. Both values come from .env and
    # default to the safe option, so an unconfigured production box is not exposed.
    debug = os.getenv('FLASK_DEBUG', 'False').strip().lower() in ('1', 'true', 'yes')
    host = os.getenv('HOST', '127.0.0.1')

    app.run(host=host, port=port, debug=debug)
