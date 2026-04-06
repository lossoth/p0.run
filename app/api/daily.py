"""Daily Incident Challenge API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
import hashlib
from app.config.database import get_db
from app.services.scenario_engine import ScenarioEngine
from app.services.user_service import get_or_create_user
from app.models import Scenario

router = APIRouter(prefix="/api/v1/daily", tags=["daily"])


def _get_daily_scenario_and_date(db: Session) -> tuple[Scenario, str]:
    today = date.today()
    date_str = today.isoformat()
    
    scenarios = db.query(Scenario).filter(Scenario.is_active == True).all()
    
    if not scenarios:
        raise HTTPException(status_code=404, detail="No active scenarios available")
    
    hash_input = f"{date_str}"
    hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
    index = hash_value % len(scenarios)
    
    selected = scenarios[index]
    return selected, date_str


class DailyChallengeResponse(BaseModel):
    date: str
    scenario: str
    difficulty: str


class StartDailyRequest(BaseModel):
    anonymous_id: str | None = None


@router.get("", response_model=DailyChallengeResponse)
def get_daily_challenge(db: Session = Depends(get_db)):
    """Get today's daily incident challenge."""
    selected, date_str = _get_daily_scenario_and_date(db)
    
    return DailyChallengeResponse(
        date=date_str,
        scenario=selected.slug,
        difficulty=selected.difficulty
    )


@router.post("/start")
def start_daily_challenge(request: StartDailyRequest, db: Session = Depends(get_db)):
    """Start today's daily incident challenge."""
    selected, _ = _get_daily_scenario_and_date(db)
    
    user = get_or_create_user(db, request.anonymous_id)
    
    engine = ScenarioEngine(db)
    try:
        result = engine.start_attempt(user.id, selected.id)
        result["scenario"] = selected.slug
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
