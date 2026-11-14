import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import sessionmaker, DeclarativeBase


def _normalize_database_url(raw_url: str | None) -> str:
    if not raw_url or not raw_url.strip():
        raise RuntimeError(
            "DATABASE_URL is required. Set it to your Neon PostgreSQL connection URL."
        )

    try:
        url = make_url(raw_url.strip())
    except ArgumentError as exc:
        raise RuntimeError(
            "DATABASE_URL must be a valid Neon PostgreSQL connection URL."
        ) from exc

    if url.get_backend_name() != "postgresql":
        raise RuntimeError(
            "DATABASE_URL must use PostgreSQL (Neon); SQLite is not supported."
        )
    if not url.host or not url.database:
        raise RuntimeError(
            "DATABASE_URL must include the PostgreSQL host and database name."
        )
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    elif url.drivername != "postgresql+psycopg":
        raise RuntimeError(
            "Use a postgresql+psycopg:// URL; the psycopg driver is required."
        )

    return url.render_as_string(hide_password=False)


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL"))
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
