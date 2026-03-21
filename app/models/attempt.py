from sqlalchemy import Column, Integer, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.config.database import Base


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    current_node_id = Column(Integer, ForeignKey("nodes.id"), nullable=True)
    score = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    explanation = Column(Text, nullable=True)

    user = relationship("User", back_populates="attempts")
    scenario = relationship("Scenario", back_populates="attempts")
    current_node = relationship("Node")
    attempt_actions = relationship("AttemptAction", back_populates="attempt")
