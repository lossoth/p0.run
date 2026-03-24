import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.scenario import Scenario
from app.models.node import Node
from app.models.action import Action
from app.models.edge import Edge


class IncidentParser:
    """Parser for incident DSL files."""
    
    CONTENT_TYPE_MAP = {
        "terminal:": "terminal",
        "logs:": "logs",
        "text:": "text",
    }
    
    def __init__(self, content: str):
        self.content = content
        self.lines = content.strip().split("\n")
        self.pos = 0
        
    def parse(self) -> Tuple[str, str | None, int, List[Dict], Dict[str, Dict]]:
        """Parse incident file and return scenario info, nodes, and edges."""
        title, description, max_points = self._parse_header()
        
        node_blocks = self.content.split("\n---\n")
        
        nodes = []
        node_map = {}
        
        for block in node_blocks:
            block_lines = block.strip().split("\n")
            if not block_lines:
                continue
            
            start_line = None
            node_id = None
            
            for i, line in enumerate(block_lines):
                stripped = line.strip()
                if stripped == "START":
                    start_line = i
                    node_id = "START"
                    break
                elif stripped.startswith("NODE "):
                    start_line = i
                    node_id = stripped.replace("NODE ", "").strip()
                    break
            
            if node_id:
                node_data = self._parse_block(block, node_id)
                nodes.append(node_data)
                node_map[node_id] = node_data
                
        return title, description, max_points, nodes, node_map
    
    def _parse_block(self, block: str, node_id: str) -> Dict:
        """Parse a single node block."""
        lines = block.strip().split("\n")
        
        start_pos = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped == "START" or stripped.startswith("NODE "):
                start_pos = i
                break
        
        self.pos = start_pos
        self.lines = lines
        
        if node_id == "START":
            return self._parse_start_node()
        else:
            return self._parse_node(node_id)
    
    def _parse_header(self) -> Tuple[str, str | None, int]:
        """Parse incident title, description and max_points."""
        title = "Untitled Incident"
        description = None
        max_points = None
        
        i = 0
        while i < len(self.lines):
            stripped = self.lines[i].strip()
            if stripped.startswith("INCIDENT:"):
                title = stripped.split("INCIDENT:")[1].strip()
                i += 1
            elif stripped.startswith("DESCRIPTION:"):
                description = self._parse_multiline_section(i, ["MAX_POINTS:"])
                i = self.pos
            elif stripped.startswith("MAX_POINTS:"):
                max_points_str = stripped.replace("MAX_POINTS:", "").strip()
                try:
                    max_points = int(max_points_str)
                except ValueError:
                    raise ValueError(f"Invalid MAX_POINTS value: '{max_points_str}'. Must be an integer.")
                i += 1
            else:
                i += 1
        
        if max_points is None:
            raise ValueError("MAX_POINTS is required in incident file.")
        
        return title, description, max_points
    
    def _parse_multiline_section(self, start_pos: int, end_markers: List[str]) -> str:
        """Parse a multiline section starting from start_pos until hitting end_markers."""
        content_parts = []
        self.pos = start_pos
        
        # Handle the first line - it might have content after the marker
        first_line = self.lines[self.pos]
        stripped = first_line.strip()
        
        # Find which marker we're starting with
        start_marker = None
        for marker in ["DESCRIPTION:", "INCIDENT:"]:
            if stripped.startswith(marker):
                start_marker = marker
                break
        
        if start_marker:
            # Extract content after the marker on the first line
            after_marker = stripped.split(start_marker)[1].strip()
            if after_marker:
                content_parts.append(after_marker)
            self.pos += 1
        else:
            # If no marker found, just start from current position
            self.pos += 1
        
        # Continue parsing until we hit an end marker
        while self.pos < len(self.lines):
            line = self.lines[self.pos]
            stripped = line.strip()
            
            # Check if we've hit an end marker
            if any(stripped.startswith(marker) for marker in end_markers):
                break
            
            content_parts.append(line)
            self.pos += 1
        
        return "\n".join(content_parts).strip()
    
    def _parse_start_node(self) -> Dict:
        """Parse START node."""
        self.pos += 1
        content, content_type = self._parse_content()
        actions = self._parse_actions("START")
        
        return {
            "node_id": "START",
            "title": "Start",
            "description": "Initial state",
            "content": content,
            "content_type": content_type,
            "is_start": True,
            "is_terminal": False,
            "actions": actions,
        }
    
    def _parse_node(self, node_id: str) -> Dict:
        """Parse a regular node."""
        self.pos += 1
        
        is_terminal = False
        for i in range(self.pos, len(self.lines)):
            if self.lines[i].strip().startswith("END"):
                is_terminal = True
                break
        
        content, content_type = self._parse_content()
        
        actions = [] if is_terminal else self._parse_actions(node_id)
        
        return {
            "node_id": node_id,
            "title": node_id.replace("_", " ").title(),
            "description": f"Node: {node_id}",
            "content": content,
            "content_type": content_type,
            "is_start": False,
            "is_terminal": is_terminal,
            "actions": actions,
        }
    
    def _parse_content(self) -> Tuple[Optional[str], str]:
        """Parse node content (terminal output or logs)."""
        content_parts = []
        content_type = "text"
        shell_commands = {}
        
        while self.pos < len(self.lines):
            line = self.lines[self.pos]

            if line.startswith(">") or line.startswith("$"):
                cmd_line = line.rstrip()
                output_lines = []
                self.pos += 1
                while self.pos < len(self.lines):
                    next_line = self.lines[self.pos].rstrip()
                    if next_line.startswith(">") or next_line.startswith("$") or next_line.startswith("ACTIONS") or next_line.startswith("NODE ") or next_line == "---" or next_line.startswith("END "):
                        break
                    output_lines.append(next_line)
                    self.pos += 1
                shell_commands[cmd_line] = "\n".join(output_lines)
                content_parts.append(cmd_line)
                if output_lines:
                    content_parts.append("\n".join(output_lines))
                continue

            stripped = line.strip()
            
            matched_marker = False
            for marker, ctype in self.CONTENT_TYPE_MAP.items():
                if stripped.startswith(marker):
                    content_type = ctype
                    self.pos += 1
                    matched_marker = True
                    break
            
            if matched_marker:
                continue
            
            if stripped in ("", "ACTIONS", "END SUCCESS", "END FAILURE", "NODE ") or stripped.startswith("NODE ") or stripped == "---":
                break
                
            if stripped not in self.CONTENT_TYPE_MAP.keys():
                content_parts.append(line)
            self.pos += 1
            
        content = "\n".join(content_parts).strip() if content_parts else None
        return content, content_type
    
    def _parse_actions(self, node_id: str) -> List[Dict]:
        """Parse actions list."""
        actions = []
        
        while self.pos < len(self.lines):
            line = self.lines[self.pos].strip()
            
            if line != "ACTIONS":
                self.pos += 1
                continue
            
            self.pos += 1
            break
        
        while self.pos < len(self.lines):
            line = self.lines[self.pos].strip()
            
            if not line or line.startswith("END") or line.startswith("NODE ") or line == "---":
                break
            
            match = re.match(r"^(\d+)\s+(.+?)\s*->\s*(\w+)\s*\[points=([+-]?\d+)\]$", line)
            if not match:
                raise ValueError(
                    f"Invalid action format: '{line}'. Expected format: 'N label -> target [points=N]'"
                )
            
            order = int(match.group(1))
            label = match.group(2).strip()
            target = match.group(3).strip()
            points_str = match.group(4)
            
            try:
                points = int(points_str)
            except ValueError:
                raise ValueError(f"Invalid points value: '{points_str}'. Must be an integer.")
            
            actions.append({
                "label": label,
                "action_order": order,
                "target": target,
                "points": points,
            })
            self.pos += 1
            
        return actions


class IncidentLoader:
    """Loads incident files into the database."""
    
    def __init__(self, db: Session):
        self.db = db
        
    def load_file(self, file_path: str, overwrite: bool = False) -> Scenario:
        """Load an incident file into the database."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Incident file not found: {file_path}")
            
        content = path.read_text()
        return self.load_content(content, path.stem, overwrite)
    
    def load_content(self, content: str, scenario_slug: str, overwrite: bool = False) -> Scenario:
        """Load incident from content string."""
        parser = IncidentParser(content)
        title, description, max_points, nodes_data, node_map = parser.parse()
        
        if overwrite:
            existing = self.db.query(Scenario).filter(Scenario.slug == scenario_slug).first()
            if existing:
                self.db.query(Edge).filter(
                    Edge.to_node_id.in_([n.id for n in existing.nodes])
                ).delete()
                self.db.query(Action).filter(
                    Action.node_id.in_([n.id for n in existing.nodes])
                ).delete()
                self.db.query(Node).filter(Node.scenario_id == existing.id).delete()
                self.db.delete(existing)
                self.db.commit()
        
        scenario = Scenario(
            slug=scenario_slug,
            title=title,
            description=description,
            difficulty="medium",
            max_points=max_points,
        )
        self.db.add(scenario)
        self.db.flush()
        
        node_instances = {}
        for node_data in nodes_data:
            if node_data.get("is_terminal") and node_data.get("actions"):
                raise ValueError(
                    f"Terminal node '{node_data['node_id']}' cannot define actions"
                )
            
            node = Node(
                scenario_id=scenario.id,
                node_id=node_data["node_id"],
                title=node_data["title"],
                description=node_data["description"],
                content=node_data["content"],
                content_type=node_data["content_type"],
                is_start=node_data["is_start"],
                is_terminal=node_data["is_terminal"],
            )
            self.db.add(node)
            self.db.flush()
            node_instances[node_data["node_id"]] = node
        

        # Verify exactly one START node
        start_nodes = [n for n in nodes_data if n.get("is_start")]
        if len(start_nodes) != 1:
            raise ValueError(f"Scenario must contain exactly one START node, found {len(start_nodes)}")
            
        self._link_actions(nodes_data, node_instances)
        
        self.db.commit()
        self.db.refresh(scenario)
        return scenario
    
    def _link_actions(self, nodes_data: List[Dict], node_instances: Dict[str, Node]):
        """Link actions to target nodes via edges."""
        node_ids = set(node_instances.keys())
        
        for node_data in nodes_data:
            node = node_instances[node_data["node_id"]]
            
            for action_data in node_data.get("actions", []):
                action = Action(
                    node_id=node.id,
                    label=action_data["label"],
                    action_order=action_data["action_order"],
                    points=action_data.get("points", 0),
                )
                self.db.add(action)
                self.db.flush()
                
                target = action_data.get("target")
                if target:
                    if target not in node_instances:
                        raise ValueError(
                            f"Action '{action_data['label']}' references non-existent node '{target}'. "
                            f"Available nodes: {node_ids}"
                        )
                    edge = Edge(
                        action_id=action.id,
                        to_node_id=node_instances[target].id,
                    )
                    self.db.add(edge)
