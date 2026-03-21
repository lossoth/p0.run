"""Database configuration and connection."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables and seed data."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        from app.models import User
        if not db.query(User).filter_by(username="admin").first():
            admin = User(username="admin", email="admin@incident.game", is_admin=True)
            db.add(admin)
            db.commit()
    finally:
        db.close()
