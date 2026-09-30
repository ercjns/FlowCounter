from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

# --- Approaches ---
class ApproachBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    compass_degrees: int = Field(..., ge=0, le=359)
    type: Literal["entry", "exit", "bike", "sidewalk"]

class ApproachCreate(ApproachBase):
    pass

class ApproachResponse(ApproachBase):
    id: str
    intersection_id: str
    model_config = ConfigDict(from_attributes=True)

class ApproachUpdate(BaseModel):
    name: Optional[str] = Field(None)
    compass_degrees: Optional[int] = Field(None)
    type: Optional[Literal["entry","exit","bike","sidewalk"]] = Field(None)

# --- Movements ---
class MovementBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    entry_approach_id: str
    exit_approach_id: str
    movement_type: Optional[str] = "thru"
    valid_mode_ids: List[str] = Field(default_factory=list)

class MovementCreate(MovementBase):
    pass

class MovementResponse(MovementBase):
    id: str
    intersection_id: str
    model_config = ConfigDict(from_attributes=True)

class movementUpdate(BaseModel):
    name: Optional[str]
    movement_type: Optional[str]

# --- Travel Modes ---
class TravelModeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = "#0d6efd"
    sort_order: Optional[int] = 0

class TravelModeCreate(TravelModeBase):
    pass

class TravelModeResponse(TravelModeBase):
    id: str
    intersection_id: str
    model_config = ConfigDict(from_attributes=True)

class TravelModeUpdate(BaseModel):
    name: Optional[str]
    color: Optional[str]
    sort_order: Optional[int]

# --- Intersections ---
class IntersectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    password: Optional[str] = None
    approaches: List[ApproachCreate] = []
    modes: List[TravelModeCreate] = []
    movements: List[MovementCreate] = []

class IntersectionSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    has_password: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class IntersectionDetail(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    has_password: bool
    created_at: datetime
    approaches: List[ApproachResponse] = []
    movements: List[MovementResponse] = []
    modes: List[TravelModeResponse] = []
    model_config = ConfigDict(from_attributes=True)

class PasswordVerification(BaseModel):
    password: Optional[str] = None

class IntersectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

# --- Sessions ---
class SessionCreate(BaseModel):
    counter_name: str = Field(..., min_length=1, max_length=150)
    password: Optional[str] = None
    assigned_modes: Optional[List[str]] = None
    assigned_movements: Optional[List[str]] = None
    movement_modes: Optional[dict[str, List[str]]] = None
    notes: Optional[str] = None

class SessionResponse(BaseModel):
    id: str
    intersection_id: str
    counter_name: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    assigned_modes: List[str]
    assigned_movements: List[str]
    movement_modes: Optional[dict[str, List[str]]] = None
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# --- Tally Events ---
class TallyEventCreate(BaseModel):
    movement_id: str
    mode_id: str
    timestamp: Optional[datetime] = None

class TallyBatchCreate(BaseModel):
    events: List[TallyEventCreate]

class TallyEventResponse(BaseModel):
    id: str
    session_id: str
    intersection_id: str
    movement_id: str
    mode_id: str
    timestamp: datetime
    bucket_15m: datetime
    model_config = ConfigDict(from_attributes=True)

class SessionStats(BaseModel):
    session_id: str
    totals: dict
    bucket_15m_totals: dict
    current_bucket_str: str
