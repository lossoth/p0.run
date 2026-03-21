from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.config.database import Base


class AttemptAction(Base):
    __tablename__ = "attempt_actions"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("attempts.id"), nullable=False)
    node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    action_id = Column(Integer, ForeignKey("actions.id"), nullable=True)
    action_label = Column(String(255), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    points_earned = Column(Integer, default=0)

    attempt = relationship("Attempt", back_populates="attempt_actions")
    node = relationship("Node")
