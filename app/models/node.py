from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.config.database import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    node_id = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    content = Column(Text, nullable=True)
    content_type = Column(String(50), default="text")
    is_start = Column(Boolean, default=False)
    is_terminal = Column(Boolean, default=False)

    scenario = relationship("Scenario", back_populates="nodes")
    actions = relationship("Action", back_populates="node")
    edges_to = relationship("Edge", foreign_keys="Edge.to_node_id", back_populates="to_node")
