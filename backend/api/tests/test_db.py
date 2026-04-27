"""Unit tests for api.db — init_db and get_conn helpers."""
import os
from unittest.mock import MagicMock, patch, call

import pytest


class TestGetConn:
    def test_get_conn_uses_env_url(self, monkeypatch):
        """get_conn must call psycopg2.connect with whatever DATABASE_URL is set to."""
        test_url = "postgresql://testuser:testpass@testhost:5432/testdb"
        monkeypatch.setenv("DATABASE_URL", test_url)

        # Re-import db so the module-level DATABASE_URL picks up the new env var.
        # We patch psycopg2.connect inside the api.db namespace.
        with patch("api.db.psycopg2.connect") as mock_connect:
            mock_connect.return_value = MagicMock()

            # Force module-level constant re-evaluation by importing after patch
            import importlib
            import api.db as db_module
            importlib.reload(db_module)

            db_module.get_conn()

            mock_connect.assert_called_once()
            args, kwargs = mock_connect.call_args
            # First positional arg is the DSN/URL
            assert args[0] == test_url

    def test_get_conn_passes_realdict_cursor(self, monkeypatch):
        """get_conn must request a RealDictCursor factory."""
        from psycopg2.extras import RealDictCursor

        with patch("api.db.psycopg2.connect") as mock_connect:
            mock_connect.return_value = MagicMock()

            import importlib
            import api.db as db_module
            importlib.reload(db_module)

            db_module.get_conn()

            _, kwargs = mock_connect.call_args
            assert kwargs.get("cursor_factory") is RealDictCursor


class TestInitDb:
    def test_init_db_creates_table(self):
        """init_db must execute a CREATE TABLE IF NOT EXISTS analysis_jobs statement."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        # conn.__enter__ returns the connection itself (context manager protocol)
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        # cursor context manager
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("api.db.psycopg2.connect", return_value=mock_conn):
            import importlib
            import api.db as db_module
            importlib.reload(db_module)

            db_module.init_db()

        # Verify execute was called at least once
        assert mock_cursor.execute.called, "cursor.execute was never called"

        # Grab the SQL that was passed and check the table name is present
        executed_sql: str = mock_cursor.execute.call_args[0][0]
        assert "CREATE TABLE IF NOT EXISTS analysis_jobs" in executed_sql

    def test_init_db_commits_after_create(self):
        """init_db must call conn.commit() so the DDL is persisted."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("api.db.psycopg2.connect", return_value=mock_conn):
            import importlib
            import api.db as db_module
            importlib.reload(db_module)

            db_module.init_db()

        mock_conn.commit.assert_called_once()
