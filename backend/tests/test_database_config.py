import pytest

from app.database import _normalize_database_url


def test_database_url_is_required():
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        _normalize_database_url(None)


def test_sqlite_database_url_is_rejected():
    with pytest.raises(RuntimeError, match="SQLite is not supported"):
        _normalize_database_url("sqlite:///./uniroom.db")


def test_postgresql_url_uses_psycopg_driver():
    url = _normalize_database_url(
        "postgresql://user:password@ep-example.neon.tech/uniroom?sslmode=require"
    )

    assert url.startswith("postgresql+psycopg://")
    assert "ep-example.neon.tech/uniroom" in url
