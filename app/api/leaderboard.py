"""Leaderboard API routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from app.config.database import get_db
from app.models import User, Attempt

router = APIRouter(prefix="/api/v1/leaderboard", tags=["leaderboard"])


class Leader(BaseModel):
    user: str
    solved: int


class LeaderboardResponse(BaseModel):
    leaders: list[Leader]


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(db: Session = Depends(get_db)):
    """Get top users ordered by number of solved incidents."""
    results = db.query(
        User.username,
        func.count(Attempt.id).label("solved")
    ).join(Attempt, Attempt.user_id == User.id).filter(
        Attempt.is_completed == True
    ).group_by(User.id, User.username).order_by(
        func.count(Attempt.id).desc()
    ).limit(20).all()

    return LeaderboardResponse(
        leaders=[Leader(user=row.username, solved=row.solved) for row in results]
    )