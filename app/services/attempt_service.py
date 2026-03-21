from sqlalchemy.orm import Session
from app.models import Attempt, AttemptAction, Node


def build_attempt_timeline(db: Session, attempt_id: int) -> dict:
    """
    Build a structured timeline of decisions taken during an attempt.
    
    Args:
        db: Database session
        attempt_id: ID of the attempt
        
    Returns:
        Dictionary containing attempt timeline with events
    """
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id).first()
    if not attempt:
        raise ValueError(f"Attempt {attempt_id} not found")
    
    scenario = attempt.scenario
    
    attempt_actions = db.query(AttemptAction).filter(
        AttemptAction.attempt_id == attempt_id
    ).order_by(AttemptAction.id).all()
    
    events = []
    for step, action in enumerate(attempt_actions, start=1):
        node = db.query(Node).filter(Node.id == action.node_id).first()
        events.append({
            "step": step,
            "node": node.node_id if node else str(action.node_id),
            "action": action.action_label,
            "timestamp": action.timestamp.isoformat() if action.timestamp else None
        })
    
    return {
        "attempt_id": attempt_id,
        "scenario": scenario.slug if scenario else None,
        "events": events
    }
