"""User service for anonymous user management."""
from sqlalchemy.orm import Session
from app.models import User


def get_or_create_user(db: Session, anonymous_id: str | None) -> User:
    """Get or create a user by anonymous_id.
    
    If anonymous_id is missing, returns default admin user (fallback).
    If user with anonymous_id exists, returns that user.
    Otherwise, creates a new user with anonymous_id.
    """
    if not anonymous_id:
        return _get_default_user(db)
    
    user = db.query(User).filter(User.anonymous_id == anonymous_id).first()
    if user:
        return user
    
    username = f"anon_{anonymous_id[:8]}"
    new_user = User(
        username=username,
        anonymous_id=anonymous_id,
        is_admin=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


def _get_default_user(db: Session) -> User:
    """Get default admin user as fallback."""
    user = db.query(User).filter(User.is_admin == True).first()
    if user:
        return user
    
    user = db.query(User).first()
    if user:
        return user
    
    raise ValueError("No users found in database")
