from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.config.database import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(255), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    difficulty = Column(String(50), default="medium")
    max_points = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    nodes = relationship("Node", back_populates="scenario")
    attempts = relationship("Attempt", back_populates="scenario")
