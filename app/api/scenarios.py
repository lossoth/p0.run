"""Scenario API routes."""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, ConfigDict
from app.config.database import get_db
from app.services.scenario_engine import ScenarioEngine
from app.services.user_service import get_or_create_user
from app.models import Scenario, Node, Action

router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])
APP_ENV = os.getenv("APP_ENV", "dev")


class ScenarioSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    slug: str
    title: str
    description: str | None
    difficulty: str
    estimated_time: int | None
    max_points: int | None


class ScenarioDetail(ScenarioSummary):
    model_config = ConfigDict(from_attributes=True)
    
    nodes: int
    terminal_nodes: int
    actions: int


class StartAttemptRequest(BaseModel):
    anonymous_id: str | None = None


class SubmitActionRequest(BaseModel):
    action_id: int


class GraphNode(BaseModel):
    id: str
    description: str
    is_start: bool
    is_end: bool


class GraphEdge(BaseModel):
    from_node: str
    to_node: str
    action: str


class ScenarioGraph(BaseModel):
    scenario: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]


@router.get("/", response_model=list[ScenarioSummary])
def list_scenarios(db: Session = Depends(get_db)):
    """List available scenarios (only active ones, sorted by slug)."""
    scenarios = db.query(Scenario).filter(
        Scenario.is_active == True
    ).order_by(Scenario.slug).all()

    results = []
    for s in scenarios:
        results.append(ScenarioSummary(
            id=str(s.slug),
            slug=str(s.slug),
            title=str(s.title),
            description=str(s.description) if s.description else None,
            difficulty=str(s.difficulty),
            estimated_time=None,
            max_points=int(s.max_points) if s.max_points else 0
        ))
    return results


@router.get("/{scenario_slug}", response_model=ScenarioDetail)
def get_scenario_detail(scenario_slug: str, db: Session = Depends(get_db)):
    """Get detailed information about a scenario."""
    scenario = db.query(Scenario).filter(
        Scenario.slug == scenario_slug,
        Scenario.is_active == True
    ).first()

    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_slug}' not found")

    total_nodes = db.query(func.count(Node.id)).filter(Node.scenario_id == scenario.id).scalar()
    terminal_nodes = db.query(func.count(Node.id)).filter(
        Node.scenario_id == scenario.id,
        Node.is_terminal == True
    ).scalar()
    total_actions = db.query(func.count(Action.id)).join(Node).filter(
        Node.scenario_id == scenario.id
    ).scalar()

    return ScenarioDetail(
        id=str(scenario.slug),
        slug=str(scenario.slug),
        title=str(scenario.title),
        description=str(scenario.description) if scenario.description else None,
        difficulty=str(scenario.difficulty),
        estimated_time=None,
        max_points=int(scenario.max_points) if scenario.max_points else 0,
        nodes=int(total_nodes) if total_nodes else 0,
        terminal_nodes=int(terminal_nodes) if terminal_nodes else 0,
        actions=int(total_actions) if total_actions else 0
    )


@router.post("/{scenario_slug}/start")
def start_attempt(scenario_slug: str, request: StartAttemptRequest, db: Session = Depends(get_db)):
    """Start a new attempt for a scenario by slug."""
    scenario = db.query(Scenario).filter(
        Scenario.slug == scenario_slug,
        Scenario.is_active == True
    ).first()

    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_slug}' not found")

    user = get_or_create_user(db, request.anonymous_id)

    engine = ScenarioEngine(db)
    try:
        result = engine.start_attempt(user.id, scenario.id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{scenario_slug}/attempt/{attempt_id}")
def get_current_node(scenario_slug: str, attempt_id: int, db: Session = Depends(get_db)):
    """Get current node for an attempt."""
    scenario = db.query(Scenario).filter(
        Scenario.slug == scenario_slug,
        Scenario.is_active == True
    ).first()

    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_slug}' not found")

    engine = ScenarioEngine(db)
    try:
        result = engine.get_current_node(attempt_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{scenario_slug}/attempt/{attempt_id}/action/{action_id}")
def execute_action(scenario_slug: str, attempt_id: int, action_id: int, db: Session = Depends(get_db)):
    """Execute an action on an attempt."""
    scenario = db.query(Scenario).filter(Scenario.slug == scenario_slug).first()
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_slug}' not found")

    engine = ScenarioEngine(db)
    try:
        result = engine.submit_action(attempt_id, action_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{scenario_slug}/graph", response_model=ScenarioGraph)
def get_scenario_graph(scenario_slug: str, db: Session = Depends(get_db)):
    """Get full scenario graph for debugging and visualization."""
    if APP_ENV != "dev":
        raise HTTPException(status_code=404, detail="Not found")
    
    scenario = db.query(Scenario).filter(
        Scenario.slug == scenario_slug,
        Scenario.is_active == True
    ).first()

    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_slug}' not found")

    nodes = db.query(Node).filter(Node.scenario_id == scenario.id).all()
    actions = db.query(Action).join(Node).filter(Node.scenario_id == scenario.id).all()

    graph_nodes = []
    for node in nodes:
        graph_nodes.append(GraphNode(
            id=node.node_id,
            description=node.description,
            is_start=node.is_start,
            is_end=node.is_terminal
        ))

    graph_edges = []
    for action in actions:
        edge = action.edge
        if edge:
            to_node = db.query(Node).filter(Node.id == edge.to_node_id).first()
            if to_node:
                graph_edges.append(GraphEdge(
                    from_node=action.node.node_id,
                    to_node=to_node.node_id,
                    action=action.label
                ))

    return ScenarioGraph(
        scenario=scenario.slug,
        nodes=graph_nodes,
        edges=graph_edges
    )

