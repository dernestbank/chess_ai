"""
pytest configuration for the backend test suite.

Adds the backend/ directory to sys.path so that `import worker.worker`
and `from api.models import ...` resolve correctly when pytest is run
from the backend/ directory.
"""
import os
import sys

# Insert backend/ at the front of sys.path.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
