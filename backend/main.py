import io
import csv
import os
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import engine, Base, get_db
from backend import models, schemas, utils

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="FlowCounter API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Health -----------------
@app.get("/api/health")
def health():
    return {"status": "ok"}

# ----------------- Intersections -----------------
@app.get("/api/intersections", response_model=List[schemas.IntersectionSummary])
def list_intersections(db: Session = Depends(get_db)):
    intersections = db.query(models.Intersection).order_by(models.Intersection.created_at.desc()).all()
    results = []
    for item in intersections:
        results.append(schemas.IntersectionSummary(
            id=item.id,
            name=item.name,
            description=item.description,
            has_password=bool(item.password_hash),
            created_at=item.created_at
        ))
    return results

@app.post("/api/intersections", response_model=schemas.IntersectionDetail, status_code=status.HTTP_201_CREATED)
def create_intersection(data: schemas.IntersectionCreate, db: Session = Depends(get_db)):
    valid = utils.verify_admin_key(data.adminKey)
    if not valid:
        raise HTTPException(status_code=403, detail="Invalid Admin Key")
    password_hash = utils.hash_password(data.password) if data.password else None
    intersection = models.Intersection(
        name=data.name,
        description=data.description,
        password_hash=password_hash
    )
    db.add(intersection)
    db.flush()

    approach_map = {}
    approach_type_map = {}
    for i, app_in in enumerate(data.approaches):
        if app_in.type not in ("entry", "exit", "bike", "sidewalk"):
            raise HTTPException(status_code=400, detail=f"Approach type must be 'entry', 'exit', 'bike', 'sidewalk', got '{app_in.type}'")
        approach = models.IntersectionApproach(
            intersection_id=intersection.id,
            name=app_in.name,
            compass_degrees=app_in.compass_degrees,
            type=app_in.type
        )
        db.add(approach)
        db.flush()
        approach_map[i] = approach.id
        approach_map[app_in.name] = approach.id
        approach_type_map[approach.id] = app_in.type

    mode_map = {}
    for order, mode_in in enumerate(data.modes):
        mode = models.TravelMode(
            intersection_id=intersection.id,
            name=mode_in.name,
            color=mode_in.color or "#0d6efd",
            sort_order=mode_in.sort_order if mode_in.sort_order is not None else order
        )
        db.add(mode)
        db.flush()
        mode_map[order] = mode.id
        mode_map[mode_in.name] = mode.id

    for mov_in in data.movements:
        entry_id = approach_map.get(mov_in.entry_approach_id, mov_in.entry_approach_id)
        exit_id = approach_map.get(mov_in.exit_approach_id, mov_in.exit_approach_id)

        if approach_type_map.get(entry_id) == "exit":
            raise HTTPException(status_code=400, detail=f"Movement entry approach must not have type 'exit'")
        if approach_type_map.get(exit_id) == "entry":
            raise HTTPException(status_code=400, detail=f"Movement exit approach must not have type 'entry'")

        # Map valid_mode_ids (can be names, indices, or existing IDs)
        mapped_mode_ids = []
        for vm in mov_in.valid_mode_ids:
            mapped_mode_ids.append(mode_map.get(vm, vm))

        movement = models.IntersectionMovement(
            intersection_id=intersection.id,
            name=mov_in.name,
            entry_approach_id=entry_id,
            exit_approach_id=exit_id,
            movement_type=mov_in.movement_type,
            valid_mode_ids=mapped_mode_ids
        )
        db.add(movement)

    db.commit()
    db.refresh(intersection)

    return schemas.IntersectionDetail(
        id=intersection.id,
        name=intersection.name,
        description=intersection.description,
        has_password=bool(intersection.password_hash),
        created_at=intersection.created_at,
        approaches=[schemas.ApproachResponse.model_validate(a) for a in intersection.approaches],
        movements=[schemas.MovementResponse.model_validate(m) for m in intersection.movements],
        modes=[schemas.TravelModeResponse.model_validate(t) for t in intersection.modes]
    )

@app.get("/api/intersections/{intersection_id}", response_model=schemas.IntersectionDetail)
def get_intersection(intersection_id: str, db: Session = Depends(get_db)):
    intersection = db.query(models.Intersection).filter(models.Intersection.id == intersection_id).first()
    if not intersection:
        raise HTTPException(status_code=404, detail="Intersection not found")
    
    return schemas.IntersectionDetail(
        id=intersection.id,
        name=intersection.name,
        description=intersection.description,
        has_password=bool(intersection.password_hash),
        created_at=intersection.created_at,
        approaches=[schemas.ApproachResponse.model_validate(a) for a in intersection.approaches],
        movements=[schemas.MovementResponse.model_validate(m) for m in intersection.movements],
        modes=[schemas.TravelModeResponse.model_validate(t) for t in intersection.modes]
    )

@app.post("/api/intersections/{intersection_id}/verify-password")
def verify_intersection_password(intersection_id: str, data: schemas.PasswordVerification, db: Session = Depends(get_db)):
    intersection = db.query(models.Intersection).filter(models.Intersection.id == intersection_id).first()
    if not intersection:
        raise HTTPException(status_code=404, detail="Intersection not found")
    if not intersection.password_hash:
        return {"valid": True}
    valid = utils.verify_password(data.password or "", intersection.password_hash)
    if not valid:
        raise HTTPException(status_code=403, detail="Invalid password")
    return {"valid": True}

# ----------------- Sessions -----------------
@app.post("/api/intersections/{intersection_id}/sessions", response_model=schemas.SessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(intersection_id: str, data: schemas.SessionCreate, db: Session = Depends(get_db)):
    intersection = db.query(models.Intersection).filter(models.Intersection.id == intersection_id).first()
    if not intersection:
        raise HTTPException(status_code=404, detail="Intersection not found")
    
    if intersection.password_hash:
        if not data.password or not utils.verify_password(data.password, intersection.password_hash):
            raise HTTPException(status_code=403, detail="Invalid password for this intersection")
    
    valid_movement_ids = {m.id for m in intersection.movements}
    valid_mode_ids = {m.id for m in intersection.modes}

    assigned_movements = list(data.assigned_movements or [])
    assigned_modes = list(data.assigned_modes or [])
    movement_modes = data.movement_modes or {}

    if movement_modes:
        # Deduce assigned_movements and assigned_modes from movement_modes
        for mov_id, modes_list in movement_modes.items():
            if mov_id not in valid_movement_ids:
                raise HTTPException(status_code=400, detail=f"Invalid movement ID: {mov_id}")
            if mov_id not in assigned_movements:
                assigned_movements.append(mov_id)
            for mode_id in modes_list:
                if mode_id not in valid_mode_ids:
                    raise HTTPException(status_code=400, detail=f"Invalid mode ID: {mode_id}")
                if mode_id not in assigned_modes:
                    assigned_modes.append(mode_id)
    else:
        for mov_id in assigned_movements:
            if mov_id not in valid_movement_ids:
                raise HTTPException(status_code=400, detail=f"Invalid movement ID: {mov_id}")

        for mode_id in assigned_modes:
            if mode_id not in valid_mode_ids:
                raise HTTPException(status_code=400, detail=f"Invalid mode ID: {mode_id}")

    session = models.CountingSession(
        intersection_id=intersection.id,
        counter_name=data.counter_name.strip(),
        started_at=None,
        assigned_modes=assigned_modes,
        assigned_movements=assigned_movements,
        movement_modes=movement_modes if movement_modes else None,
        notes=data.notes
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@app.post("/api/sessions/{session_id}/start", response_model=schemas.SessionResponse)
def begin_session_counting(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.started_at:
        session.started_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)
    return session

@app.get("/api/sessions/{session_id}", response_model=schemas.SessionResponse)
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@app.post("/api/sessions/{session_id}/end", response_model=schemas.SessionResponse|None)
def end_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.started_at:
        # this is new to handle abandon session after configure.
        db.delete(session)
        db.commit()
        return None
    if not session.ended_at:
        session.ended_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)
    return session

# ----------------- Tally Events -----------------
@app.post("/api/sessions/{session_id}/tallies", response_model=schemas.TallyEventResponse, status_code=status.HTTP_201_CREATED)
def record_tally(session_id: str, data: schemas.TallyEventCreate, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.ended_at:
        raise HTTPException(status_code=400, detail="Cannot record tallies for an ended session")

    ts = data.timestamp or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    bucket_15m = utils.get_15m_bucket(ts)

    tally = models.TallyEvent(
        session_id=session.id,
        intersection_id=session.intersection_id,
        movement_id=data.movement_id,
        mode_id=data.mode_id,
        timestamp=ts,
        bucket_15m=bucket_15m
    )
    db.add(tally)
    db.commit()
    db.refresh(tally)
    return tally

# @app.post("/api/sessions/{session_id}/tallies/batch", response_model=List[schemas.TallyEventResponse])
@app.post("/api/sessions/{session_id}/tallies/batch", response_model=List[str])
def record_tallies_batch(session_id: str, data: schemas.TallyBatchCreate, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.ended_at:
        raise HTTPException(status_code=400, detail="Cannot record tallies for an ended session")

    created = []
    for item in data.events:
        ts = item.timestamp or datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        bucket_15m = utils.get_15m_bucket(ts)

        tally = models.TallyEvent(
            session_id=session.id,
            intersection_id=session.intersection_id,
            movement_id=item.movement_id,
            mode_id=item.mode_id,
            timestamp=ts,
            bucket_15m=bucket_15m
        )
        db.add(tally)
        created.append(tally)

    db.commit()
    for tally in created:
        db.refresh(tally)
    # return created
    return [x.id for x in created]

@app.delete("/api/sessions/{session_id}/tallies/last")
def undo_last_tally(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    last_tally = db.query(models.TallyEvent).filter(
        models.TallyEvent.session_id == session_id
    ).order_by(models.TallyEvent.timestamp.desc()).first()

    if not last_tally:
        raise HTTPException(status_code=404, detail="No tallies found to undo")

    deleted_info = {
        "id": last_tally.id,
        "movement_id": last_tally.movement_id,
        "mode_id": last_tally.mode_id,
        "timestamp": last_tally.timestamp.isoformat()
    }
    db.delete(last_tally)
    db.commit()
    return {"deleted": deleted_info}

@app.get("/api/sessions/{session_id}/stats", response_model=schemas.SessionStats)
def get_session_stats(session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.CountingSession).filter(models.CountingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc)
    # TODO: I'M MESSING WITH TIMEZONE ON THE LINE BELOW HERE
    # I believe this only affects the *displayed* bucket time in the counting page
    # It appears that the times and buckets are still recoreded in UTC after making this change
    # ... so maybe undo this change?
    current_bucket = utils.get_15m_bucket(now).astimezone(timezone(timedelta(hours=1), 'WEsT')) # extra .astimezone

    tallies = db.query(
        models.TallyEvent.movement_id,
        models.TallyEvent.mode_id,
        func.count(models.TallyEvent.id)
    ).filter(models.TallyEvent.session_id == session_id).group_by(
        models.TallyEvent.movement_id, models.TallyEvent.mode_id
    ).all()

    totals = {}
    for mov_id, mode_id, count in tallies:
        totals[f"{mov_id}:{mode_id}"] = count

    bucket_tallies = db.query(
        models.TallyEvent.movement_id,
        models.TallyEvent.mode_id,
        func.count(models.TallyEvent.id)
    ).filter(
        models.TallyEvent.session_id == session_id,
        models.TallyEvent.bucket_15m == current_bucket
    ).group_by(
        models.TallyEvent.movement_id, models.TallyEvent.mode_id
    ).all()

    bucket_totals = {}
    for mov_id, mode_id, count in bucket_tallies:
        bucket_totals[f"{mov_id}:{mode_id}"] = count

    return schemas.SessionStats(
        session_id=session_id,
        totals=totals,
        bucket_15m_totals=bucket_totals,
        current_bucket_str=current_bucket.strftime("%Y-%m-%d %H:%M")
    )

# ----------------- Export Capabilities -----------------
@app.get("/api/intersections/{intersection_id}/export/raw")
def export_raw_data(
    intersection_id: str,
    session_ids: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.TallyEvent).filter(models.TallyEvent.intersection_id == intersection_id)
    if session_ids:
        query = query.filter(models.TallyEvent.session_id.in_(session_ids))
    
    events = query.order_by(models.TallyEvent.timestamp.asc()).all()

    intersection = db.query(models.Intersection).filter(models.Intersection.id == intersection_id).first()
    if not intersection:
        raise HTTPException(status_code=404, detail="Intersection not found")

    approach_map:dict[str,models.IntersectionApproach] = {a.id: a for a in intersection.approaches}
    movement_map:dict[str,models.IntersectionMovement] = {m.id: m for m in intersection.movements}
    mode_map:dict[str,models.TravelMode] = {t.id: t for t in intersection.modes}
    session_map:dict[str,models.CountingSession] = {s.id: s for s in intersection.sessions}

    output = io.StringIO()
    writer = csv.writer(output)
    # writer.writerow([
    #     "Event ID", "Timestamp (UTC)", "15m Bucket (UTC)",
    #     "Session ID", "Counter Name",
    #     "Mode", "Movement", "Movement Type",
    #     "Entry Approach", "Entry Compass Heading",
    #     "Exit Approach", "Exit Compass Heading"
    # ])

    writer.writerow([
        "EventID",
        "EventTimestamp", "TimeBucket",
        "ObserverName", "ObserverID",
        "IntersectionName", "IntersectionID",
        "Mode", "ModeID", 
        "Flow", "FlowID", 
        "Entry", "EntryID",
        "Exit", "ExitID"
    ])

    for ev in events:
        session = session_map.get(ev.session_id)
        mov = movement_map.get(ev.movement_id)
        mode = mode_map.get(ev.mode_id)
        entry_app = approach_map.get(mov.entry_approach_id) if mov else None
        exit_app = approach_map.get(mov.exit_approach_id) if mov else None

        writer.writerow([
            ev.id,
            ev.timestamp.isoformat() if ev.timestamp else "",
            ev.bucket_15m.strftime("%Y-%m-%d %H:%M") if ev.bucket_15m else "",
            session.counter_name,
            session.id,
            ev.intersection.name,
            ev.intersection_id,
            mode.name,
            mode.id,
            mov.name,
            mov.id,
            entry_app.name,
            entry_app.id,
            exit_app.name,
            exit_app.id
        ])

        # writer.writerow([
        #     ev.id,
        #     ev.timestamp.isoformat() if ev.timestamp else "",
        #     ev.bucket_15m.strftime("%Y-%m-%d %H:%M") if ev.bucket_15m else "",
        #     ev.session_id,
        #     session.counter_name if session else "",
        #     mode.name if mode else "",
        #     mov.name if mov else "",
        #     mov.movement_type if mov else "",
        #     entry_app.name if entry_app else "",
        #     entry_app.compass_degrees if entry_app else "",
        #     exit_app.name if exit_app else "",
        #     exit_app.compass_degrees if exit_app else ""
        # ])

    output.seek(0)
    filename = f"traffic_raw_{intersection.name.replace(' ', '_')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/intersections/{intersection_id}/export/summary-15m")
def export_summary_15m(
    intersection_id: str,
    session_ids: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db)
):
    intersection = db.query(models.Intersection).filter(models.Intersection.id == intersection_id).first()
    if not intersection:
        raise HTTPException(status_code=404, detail="Intersection not found")

    query = db.query(
        models.TallyEvent.bucket_15m,
        models.TallyEvent.movement_id,
        models.TallyEvent.mode_id,
        func.count(models.TallyEvent.id).label("count")
    ).filter(models.TallyEvent.intersection_id == intersection_id)

    if session_ids:
        query = query.filter(models.TallyEvent.session_id.in_(session_ids))

    aggregated = query.group_by(
        models.TallyEvent.bucket_15m,
        models.TallyEvent.movement_id,
        models.TallyEvent.mode_id
    ).order_by(models.TallyEvent.bucket_15m.asc()).all()

    cols = []
    for mov in intersection.movements:
        for mode in sorted(intersection.modes, key=lambda m: m.sort_order):
            cols.append((mov.id, mode.id, f"{mov.name} - {mode.name}"))

    matrix = {}
    for bucket_dt, mov_id, mode_id, count in aggregated:
        bucket_str = bucket_dt.strftime("%Y-%m-%d %H:%M")
        if bucket_str not in matrix:
            matrix[bucket_str] = {}
        matrix[bucket_str][(mov_id, mode_id)] = count

    output = io.StringIO()
    writer = csv.writer(output)
    
    header = ["15-Minute Interval (UTC)"] + [c[2] for c in cols] + ["Total Interval Count"]
    writer.writerow(header)

    for bucket_str in sorted(matrix.keys()):
        row = [bucket_str]
        interval_sum = 0
        for mov_id, mode_id, _ in cols:
            val = matrix[bucket_str].get((mov_id, mode_id), 0)
            row.append(val)
            interval_sum += val
        row.append(interval_sum)
        writer.writerow(row)

    output.seek(0)
    filename = f"traffic_15min_summary_{intersection.name.replace(' ', '_')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ----------------- Static Frontend Hosting -----------------
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        # Allow API routes through
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build index.html not found")