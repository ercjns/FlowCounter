import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from backend.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class Intersection(Base):
    __tablename__ = "intersections"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    password_hash = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    approaches = relationship("IntersectionApproach", back_populates="intersection", cascade="all, delete-orphan")
    movements = relationship("IntersectionMovement", back_populates="intersection", cascade="all, delete-orphan")
    modes = relationship("TravelMode", back_populates="intersection", cascade="all, delete-orphan")
    sessions = relationship("CountingSession", back_populates="intersection", cascade="all, delete-orphan")
    tallies = relationship("TallyEvent", back_populates="intersection", cascade="all, delete-orphan")


class IntersectionApproach(Base):
    __tablename__ = "intersection_approaches"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    intersection_id = Column(String(36), ForeignKey("intersections.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    compass_degrees = Column(Integer, nullable=True) # 0 to 359
    type = Column(String(20), nullable=False) # 'entry', 'exit', 'bike', 'sidewalk'

    intersection = relationship("Intersection", back_populates="approaches")


class IntersectionMovement(Base):
    __tablename__ = "intersection_movements"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    intersection_id = Column(String(36), ForeignKey("intersections.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    entry_approach_id = Column(String(36), ForeignKey("intersection_approaches.id", ondelete="CASCADE"), nullable=False)
    exit_approach_id = Column(String(36), ForeignKey("intersection_approaches.id", ondelete="CASCADE"), nullable=False)
    movement_type = Column(String(50), nullable=True) # e.g. thru, left, right, u-turn, ped_crossing
    valid_mode_ids = Column(JSON, nullable=True, default=list) # List of mode IDs valid for this movement

    intersection = relationship("Intersection", back_populates="movements")
    entry_approach = relationship("IntersectionApproach", foreign_keys=[entry_approach_id])
    exit_approach = relationship("IntersectionApproach", foreign_keys=[exit_approach_id])


class TravelMode(Base):
    __tablename__ = "travel_modes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    intersection_id = Column(String(36), ForeignKey("intersections.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    color = Column(String(50), nullable=True, default="#0d6efd") # Bootstrap primary or hex
    sort_order = Column(Integer, default=0)

    intersection = relationship("Intersection", back_populates="modes")


class CountingSession(Base):
    __tablename__ = "counting_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    intersection_id = Column(String(36), ForeignKey("intersections.id", ondelete="CASCADE"), nullable=False)
    counter_name = Column(String(150), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    assigned_modes = Column(JSON, nullable=False) # List of mode IDs
    assigned_movements = Column(JSON, nullable=False) # List of movement IDs
    movement_modes = Column(JSON, nullable=True) # Dict mapping movement_id -> list of mode IDs
    notes = Column(Text, nullable=True)

    intersection = relationship("Intersection", back_populates="sessions")
    tallies = relationship("TallyEvent", back_populates="session", cascade="all, delete-orphan")


class TallyEvent(Base):
    __tablename__ = "tally_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("counting_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    intersection_id = Column(String(36), ForeignKey("intersections.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_id = Column(String(36), ForeignKey("intersection_movements.id", ondelete="CASCADE"), nullable=False)
    mode_id = Column(String(36), ForeignKey("travel_modes.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utc_now, index=True)
    bucket_15m = Column(DateTime(timezone=True), nullable=False, index=True)

    session = relationship("CountingSession", back_populates="tallies")
    intersection = relationship("Intersection", back_populates="tallies")
    movement = relationship("IntersectionMovement")
    mode = relationship("TravelMode")
