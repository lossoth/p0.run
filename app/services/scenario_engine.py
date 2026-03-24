"""Scenario Engine - Core game logic for incident scenarios."""
from sqlalchemy.orm import Session
from datetime import datetime
from app.models import Attempt, AttemptAction, Node, Action, Edge, Scenario, User


MAX_STEPS = 25


class ScenarioEngine:
    """Manages scenario execution and user attempts."""

    def __init__(self, db: Session):
        self.db = db

    def start_attempt(self, user_id: int, scenario_id: int) -> dict:
        """Create a new attempt and set the starting node."""
        scenario = self.db.query(Scenario).filter(
            Scenario.id == scenario_id,
            Scenario.is_active == True
        ).first()

        if not scenario:
            raise ValueError(f"Scenario {scenario_id} not found or inactive")

        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User {user_id} not found")

        max_points = scenario.max_points or 100

        start_node = self.db.query(Node).filter(
            Node.scenario_id == scenario_id,
            Node.is_start == True
        ).first()

        if not start_node:
            raise ValueError(f"No start node found for scenario {scenario_id}")

        attempt = Attempt(
            user_id=user_id,
            scenario_id=scenario_id,
            current_node_id=start_node.id,
            score=0,
            is_completed=False,
            started_at=datetime.utcnow()
        )
        self.db.add(attempt)
        self.db.commit()
        self.db.refresh(attempt)

        return {
            "attempt_id": attempt.id,
            "node": self.serialize_node(start_node),
            "actions": self.serialize_actions(start_node.id),
            "score": 0,
            "max_points": max_points,
            "is_completed": False
        }

    def get_current_node(self, attempt_id: int) -> dict:
        """Return the current node for the attempt."""
        attempt = self.db.query(Attempt).filter(Attempt.id == attempt_id).first()
        if not attempt:
            raise ValueError(f"Attempt {attempt_id} not found")

        node = self.db.query(Node).filter(Node.id == attempt.current_node_id).first()
        if not node:
            raise ValueError(f"Node {attempt.current_node_id} not found")

        scenario = self.db.query(Scenario).filter(Scenario.id == attempt.scenario_id).first()
        max_points = scenario.max_points if scenario else 100

        result = {
            "node": self.serialize_node(node),
            "actions": self.serialize_actions(node.id) if not node.is_terminal else [],
            "score": attempt.score,
            "max_points": max_points,
            "is_completed": attempt.is_completed
        }

        if attempt.is_completed:
            result["best_explanation"] = self._get_best_explanation(attempt.scenario_id)

        return result

    def submit_action(self, attempt_id: int, action_id: int) -> dict:
        """Validate action and resolve to next node.

        Security: Validates that action_id belongs to the current node.
        This prevents users from submitting actions from other nodes
        or manipulating the game state by submitting arbitrary actions.
        """
        attempt = self.db.query(Attempt).filter(Attempt.id == attempt_id).first()
        if not attempt:
            raise ValueError(f"Attempt {attempt_id} not found")

        if attempt.is_completed:
            raise ValueError("Attempt already completed")

        action = self.db.query(Action).filter(Action.id == action_id).first()
        if not action:
            raise ValueError(f"Action {action_id} not found")

        # SECURITY: Validate action belongs to current node
        # This prevents unauthorized state manipulation
        if action.node_id != attempt.current_node_id:
            raise ValueError("Action does not belong to current node")

        # Calculate step count from attempt_actions
        step_count = self.db.query(AttemptAction).filter(
            AttemptAction.attempt_id == attempt_id
        ).count()

        # Check MAX_STEPS limit
        if step_count >= MAX_STEPS:
            attempt.is_completed = True
            attempt.completed_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(attempt)
            return {
                "node": None,
                "actions": [],
                "score": attempt.score,
                "is_completed": True,
                "message": "Too many steps (possible loop detected)",
                "path": self._build_path(attempt_id)
            }

        current_node = self.db.query(Node).filter(Node.id == attempt.current_node_id).first()

        # Check for repeated action from same node
        existing_actions = self.db.query(AttemptAction).filter(
            AttemptAction.attempt_id == attempt_id,
            AttemptAction.node_id == current_node.id,
            AttemptAction.action_id == action_id
        ).all()
        is_repeated = len(existing_actions) > 0

        points_to_award = 0 if is_repeated else action.points

        attempt_action = AttemptAction(
            attempt_id=attempt_id,
            node_id=current_node.id,
            action_id=action_id,
            action_label=action.label,
            timestamp=datetime.utcnow(),
            points_earned=points_to_award
        )
        self.db.add(attempt_action)

        next_node = self.resolve_next_node(action.id)

        if next_node:
            attempt.current_node_id = next_node.id
            attempt.score += points_to_award
            scenario = self.db.query(Scenario).filter(Scenario.id == attempt.scenario_id).first()
            if scenario:
                attempt.score = min(attempt.score, scenario.max_points)
            if next_node.is_terminal:
                attempt.is_completed = True
                attempt.completed_at = datetime.utcnow()
        else:
            attempt.is_completed = True
            attempt.completed_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(attempt)

        is_terminal = next_node is None or next_node.is_terminal

        scenario = self.db.query(Scenario).filter(Scenario.id == attempt.scenario_id).first()

        result = {
            "node": self.serialize_node(next_node) if next_node else None,
            "actions": [] if is_terminal else self.serialize_actions(next_node.id),
            "score": attempt.score,
            "is_completed": attempt.is_completed
        }

        if attempt.is_completed:
            result["path"] = self._build_path(attempt_id)

        return result

    def _build_path(self, attempt_id: int) -> list[str]:
        """Build a simple path list from attempt actions."""
        attempt_actions = self.db.query(AttemptAction).filter(
            AttemptAction.attempt_id == attempt_id
        ).order_by(AttemptAction.id).all()

        path = []
        for action in attempt_actions:
            path.append(action.action_label)

        return path

    def resolve_next_node(self, action_id: int) -> Node | None:
        """Determine the next node based on edge mapping."""
        edge = self.db.query(Edge).filter(Edge.action_id == action_id).first()
        if not edge:
            return None

        return self.db.query(Node).filter(Node.id == edge.to_node_id).first()

    def is_terminal_node(self, node_id: int) -> bool:
        """Detect whether the node is terminal."""
        node = self.db.query(Node).filter(Node.id == node_id).first()
        if not node:
            return False
        return node.is_terminal

    def _get_available_actions(self, node_id: int) -> list[dict]:
        """Get actions available at a node (safe - no graph exposure)."""
        actions = self.db.query(Action).filter(Action.node_id == node_id).order_by(Action.action_order).all()
        return [
            {
                "id": a.id,
                "label": a.label
            }
            for a in actions
        ]

    def serialize_node(self, node: Node) -> dict:
        """Serialize node for client consumption."""
        if not node:
            return None
        return {
            "node_id": node.node_id,
            "title": node.title,
            "description": node.description,
            "content": node.content,
            "content_type": node.content_type or "text"
        }

    def serialize_actions(self, node_id: int) -> list[dict]:
        """Serialize actions for a node."""
        return self._get_available_actions(node_id)

    def _node_to_dict(self, node: Node) -> dict:
        """Convert node to safe dictionary (no graph structure)."""
        if not node:
            return None
        return {
            "id": node.id,
            "node_id": node.node_id,
            "title": node.title,
            "description": node.description,
            "content": node.content,
            "content_type": node.content_type or "text",
            "is_terminal": node.is_terminal
        }

    def _get_best_explanation(self, scenario_id: int) -> str | None:
        """Get the best (highest scoring) explanation for a scenario."""
        best_attempt = self.db.query(Attempt).filter(
            Attempt.scenario_id == scenario_id,
            Attempt.is_completed == True,
            Attempt.explanation.isnot(None),
            Attempt.explanation != ""
        ).order_by(Attempt.score.desc()).first()

        return best_attempt.explanation if best_attempt else None
