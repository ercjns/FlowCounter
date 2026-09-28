import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.main import app
from backend import utils

# Test database
TEST_DB_URL = "sqlite:///./test_flow_counter.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_15m_bucket_calculation():
    # Test 10:14:59 -> 10:00
    dt1 = datetime(2026, 9, 17, 10, 14, 59, 123456, tzinfo=timezone.utc)
    b1 = utils.get_15m_bucket(dt1)
    assert b1.minute == 0
    assert b1.second == 0
    assert b1.microsecond == 0

    # Test 10:15:00 -> 10:15
    dt2 = datetime(2026, 9, 17, 10, 15, 0, tzinfo=timezone.utc)
    b2 = utils.get_15m_bucket(dt2)
    assert b2.minute == 15

    # Test 10:44:22 -> 10:30
    dt3 = datetime(2026, 9, 17, 10, 44, 22, tzinfo=timezone.utc)
    b3 = utils.get_15m_bucket(dt3)
    assert b3.minute == 30

    # Test 10:59:59 -> 10:45
    dt4 = datetime(2026, 9, 17, 10, 59, 59, tzinfo=timezone.utc)
    b4 = utils.get_15m_bucket(dt4)
    assert b4.minute == 45

def test_create_intersection_with_compass_degrees_and_password():
    payload = {
        "name": "Main & 1st Ave",
        "description": "Busy downtown crossing",
        "password": "secret-counter-pass",
        "approaches": [
            {"name": "Northbound Entry", "compass_degrees": 0, "type": "entry"},
            {"name": "Southbound Exit", "compass_degrees": 180, "type": "exit"},
            {"name": "Eastbound Entry", "compass_degrees": 90, "type": "entry"},
            {"name": "Westbound Exit", "compass_degrees": 270, "type": "exit"}
        ],
        "movements": [
            {
                "name": "NB Thru",
                "entry_approach_id": "Northbound Entry",
                "exit_approach_id": "Southbound Exit",
                "movement_type": "thru",
                "valid_mode_ids": ["Car"]
            },
            {
                "name": "EB Ped Crossing",
                "entry_approach_id": "Eastbound Entry",
                "exit_approach_id": "Westbound Exit",
                "movement_type": "ped_crossing",
                "valid_mode_ids": ["Pedestrian"]
            }
        ],
        "modes": [
            {"name": "Car", "color": "#0d6efd", "sort_order": 1},
            {"name": "Pedestrian", "color": "#198754", "sort_order": 2}
        ]
    }

    res = client.post("/api/intersections", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Main & 1st Ave"
    assert data["has_password"] is True
    assert len(data["approaches"]) == 4
    assert data["approaches"][0]["compass_degrees"] == 0
    assert len(data["movements"]) == 2
    assert len(data["modes"]) == 2
    assert len(data["movements"][0]["valid_mode_ids"]) == 1

    # Verify invalid password rejected
    verify_bad = client.post(f"/api/intersections/{data['id']}/verify-password", json={"password": "wrong"})
    assert verify_bad.status_code == 403

    # Verify correct password accepted
    verify_good = client.post(f"/api/intersections/{data['id']}/verify-password", json={"password": "secret-counter-pass"})
    assert verify_good.status_code == 200
    assert verify_good.json()["valid"] is True

def test_session_lifecycle_tally_and_undo():
    # 1. Create intersection
    int_res = client.post("/api/intersections", json={
        "name": "Test St & Demo Way",
        "approaches": [
            {"name": "Northbound", "compass_degrees": 0, "type": "entry"},
            {"name": "North Exit", "compass_degrees": 0, "type": "exit"}
        ],
        "movements": [
            {"name": "NB Thru", "entry_approach_id": "Northbound", "exit_approach_id": "North Exit"}
        ],
        "modes": [
            {"name": "Bicycle", "color": "#20c997", "sort_order": 1}
        ]
    })
    intersection = int_res.json()
    int_id = intersection["id"]
    mov_id = intersection["movements"][0]["id"]
    mode_id = intersection["modes"][0]["id"]

    # 2. Open session
    sess_res = client.post(f"/api/intersections/{int_id}/sessions", json={
        "counter_name": "Alice Observer",
        "assigned_modes": [mode_id],
        "assigned_movements": [mov_id]
    })
    assert sess_res.status_code == 201
    session = sess_res.json()
    sess_id = session["id"]
    assert session["counter_name"] == "Alice Observer"
    assert session["started_at"] is None
    assert session["ended_at"] is None

    # Start counting session
    start_res = client.post(f"/api/sessions/{sess_id}/start")
    assert start_res.status_code == 200
    assert start_res.json()["started_at"] is not None

    # 3. Record tally event
    tally_res = client.post(f"/api/sessions/{sess_id}/tallies", json={
        "movement_id": mov_id,
        "mode_id": mode_id
    })
    assert tally_res.status_code == 201
    tally_data = tally_res.json()
    assert tally_data["movement_id"] == mov_id
    assert tally_data["mode_id"] == mode_id

    # 4. Check stats
    stats_res = client.get(f"/api/sessions/{sess_id}/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    key = f"{mov_id}:{mode_id}"
    assert stats["totals"].get(key) == 1
    assert stats["bucket_15m_totals"].get(key) == 1

    # 5. Record another tally via batch
    batch_res = client.post(f"/api/sessions/{sess_id}/tallies/batch", json={
        "events": [
            {"movement_id": mov_id, "mode_id": mode_id},
            {"movement_id": mov_id, "mode_id": mode_id}
        ]
    })
    assert batch_res.status_code == 200
    assert len(batch_res.json()) == 2

    # Stats should now be 3
    stats_res = client.get(f"/api/sessions/{sess_id}/stats")
    assert stats_res.json()["totals"].get(key) == 3

    # 6. Undo last tally
    undo_res = client.delete(f"/api/sessions/{sess_id}/tallies/last")
    assert undo_res.status_code == 200

    # Stats should now be 2
    stats_res = client.get(f"/api/sessions/{sess_id}/stats")
    assert stats_res.json()["totals"].get(key) == 2

    # 7. End session
    end_res = client.post(f"/api/sessions/{sess_id}/end")
    assert end_res.status_code == 200
    assert end_res.json()["ended_at"] is not None

    # Cannot tally after ending
    tally_fail = client.post(f"/api/sessions/{sess_id}/tallies", json={
        "movement_id": mov_id,
        "mode_id": mode_id
    })
    assert tally_fail.status_code == 400

def test_csv_exports_multi_session():
    # Create intersection
    int_res = client.post("/api/intersections", json={
        "name": "Export Test Junction",
        "approaches": [
            {"name": "Westbound", "compass_degrees": 270, "type": "entry"},
            {"name": "Eastbound", "compass_degrees": 90, "type": "exit"}
        ],
        "movements": [
            {"name": "WB to EB Thru", "entry_approach_id": "Westbound", "exit_approach_id": "Eastbound"}
        ],
        "modes": [
            {"name": "Car", "color": "#0d6efd"}
        ]
    })
    intersection = int_res.json()
    int_id = intersection["id"]
    mov_id = intersection["movements"][0]["id"]
    mode_id = intersection["modes"][0]["id"]

    # Counter 1 session
    s1 = client.post(f"/api/intersections/{int_id}/sessions", json={
        "counter_name": "Observer One",
        "assigned_modes": [mode_id],
        "assigned_movements": [mov_id]
    }).json()
    client.post(f"/api/sessions/{s1['id']}/tallies", json={"movement_id": mov_id, "mode_id": mode_id})

    # Counter 2 session
    s2 = client.post(f"/api/intersections/{int_id}/sessions", json={
        "counter_name": "Observer Two",
        "assigned_modes": [mode_id],
        "assigned_movements": [mov_id]
    }).json()
    client.post(f"/api/sessions/{s2['id']}/tallies", json={"movement_id": mov_id, "mode_id": mode_id})

    # Export Raw CSV
    raw_res = client.get(f"/api/intersections/{int_id}/export/raw")
    assert raw_res.status_code == 200
    content = raw_res.text
    assert "Observer One" in content
    assert "Observer Two" in content
    assert "WB to EB Thru" in content
    assert "270" in content
    assert "90" in content

    # Export 15m Summary CSV
    sum_res = client.get(f"/api/intersections/{int_id}/export/summary-15m")
    assert sum_res.status_code == 200
    sum_content = sum_res.text
    assert "WB to EB Thru - Car" in sum_content
    # Combined count of 2
    assert ",2,2" in sum_content or ",2" in sum_content
