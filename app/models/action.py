from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.config.database import Base


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)
    node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    label = Column(String(255), nullable=False)
    action_order = Column(Integer, default=0)
    points = Column(Integer, nullable=False, default=0)

    node = relationship("Node", back_populates="actions")
    edge = relationship("Edge", back_populates="action", uselist=False)
