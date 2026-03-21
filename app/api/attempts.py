"""Attempt API routes."""
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from app.config.database import get_db
from app.services.scenario_engine import ScenarioEngine
from app.services.attempt_service import build_attempt_timeline
from app.models import Attempt, AttemptAction, Node

router = APIRouter(prefix="/api/v1/attempts", tags=["attempts"])


class StartAttemptRequest(BaseModel):
    user_id: int
    scenario_id: int


class SubmitActionRequest(BaseModel):
    action_id: int


class ExplanationRequest(BaseModel):
    explanation: str


@router.post("/start")
def start_attempt(request: StartAttemptRequest, db: Session = Depends(get_db)):
    """Start a new attempt for a scenario."""
    engine = ScenarioEngine(db)
    try:
        result = engine.start_attempt(request.user_id, request.scenario_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{attempt_id}")
def get_attempt(attempt_id: int, db: Session = Depends(get_db)):
    """Get current state of an attempt."""
    engine = ScenarioEngine(db)
    try:
        result = engine.get_current_node(attempt_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{attempt_id}/action")
def submit_action(attempt_id: int, request: SubmitActionRequest, db: Session = Depends(get_db)):
    """Submit an action for an attempt."""
    engine = ScenarioEngine(db)
    try:
        result = engine.submit_action(attempt_id, request.action_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class HistoryAction(BaseModel):
    step: int
    node_id: str
    action: str
    points: int


class HistoryResponse(BaseModel):
    attempt_id: int
    actions: list[HistoryAction]


class ReplayNode(BaseModel):
    node_id: str
    title: str
    action_taken: str | None = None


class ReplayResponse(BaseModel):
    attempt_id: int
    path: list[ReplayNode]
    completed: bool
    score: int


@router.get("/{attempt_id}/history", response_model=HistoryResponse)
def get_attempt_history(attempt_id: int, db: Session = Depends(get_db)):
    """Retrieve the action history of an attempt."""
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail=f"Attempt {attempt_id} not found")

    attempt_actions = db.query(AttemptAction).filter(
        AttemptAction.attempt_id == attempt_id
    ).order_by(AttemptAction.id).all()

    actions = []
    for step, action in enumerate(attempt_actions, start=1):
        node = db.query(Node).filter(Node.id == action.node_id).first()
        actions.append(HistoryAction(
            step=step,
            node_id=node.node_id if node else str(action.node_id),
            action=action.action_label,
            points=action.points_earned
        ))

    return HistoryResponse(
        attempt_id=attempt_id,
        actions=actions
    )


@router.get("/{attempt_id}/replay", response_model=ReplayResponse)
def get_attempt_replay(attempt_id: int, db: Session = Depends(get_db)):
    """Retrieve replay data for an attempt, reconstructing the path taken."""
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail=f"Attempt {attempt_id} not found")

    attempt_actions = db.query(AttemptAction).filter(
        AttemptAction.attempt_id == attempt_id
    ).order_by(AttemptAction.id).all()

    path = []
    previous_action = None
    for action in attempt_actions:
        node = db.query(Node).filter(Node.id == action.node_id).first()
        if node:
            path.append(ReplayNode(
                node_id=node.node_id,
                title=node.title,
                action_taken=previous_action
            ))
        previous_action = action.action_label

    if attempt.is_completed and attempt.current_node_id:
        final_node = db.query(Node).filter(Node.id == attempt.current_node_id).first()
        if final_node:
            path.append(ReplayNode(
                node_id=final_node.node_id,
                title=final_node.title,
                action_taken=None
            ))

    return ReplayResponse(
        attempt_id=attempt_id,
        path=path,
        completed=attempt.is_completed,
        score=attempt.score
    )


class TimelineEvent(BaseModel):
    step: int
    node: str
    action: str
    timestamp: str | None


class TimelineResponse(BaseModel):
    attempt_id: int
    scenario: str | None
    events: list[TimelineEvent]


@router.get("/{attempt_id}/timeline", response_model=TimelineResponse)
def get_attempt_timeline(attempt_id: int, db: Session = Depends(get_db)):
    """Retrieve a structured timeline of decisions taken during an attempt."""
    try:
        timeline = build_attempt_timeline(db, attempt_id)
        return TimelineResponse(
            attempt_id=timeline["attempt_id"],
            scenario=timeline["scenario"],
            events=[
                TimelineEvent(
                    step=event["step"],
                    node=event["node"],
                    action=event["action"],
                    timestamp=event["timestamp"]
                )
                for event in timeline["events"]
            ]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{attempt_id}/explanation")
def submit_explanation(attempt_id: int, request: ExplanationRequest, db: Session = Depends(get_db)):
    """Submit an explanation for resolving an incident."""
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail=f"Attempt {attempt_id} not found")

    if not attempt.is_completed:
        raise HTTPException(status_code=400, detail="Cannot submit explanation for incomplete attempt")

    text = str(request.explanation or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Explanation cannot be empty")

    text = re.sub(r'https?://\S+', '', text)
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Explanation cannot be empty")

    text = text[:500]

    attempt.explanation = text
    db.commit()

    return {"success": True, "attempt_id": attempt_id}
