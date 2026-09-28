# FlowCounter

A mobile-friendly, high-responsiveness web application for counting multi-modal traffic flows (vehicles, pedestrians, bicycles, etc.) at road intersections.

## Features
- **Intersection Configuration**:
  - Name, optional password protection.
  - Entry & Exit approaches with compass heading (0–359 degrees).
  - Valid `intersection_movements` connecting entry and exit approaches.
  - Custom travel modes (Car, Pedestrian, Bike, Bus, etc.) with custom color accents.
- **Counting Session Setup**:
  - Counter name / observer ID.
  - Password unlock for protected intersections.
  - Multi-select subset of movements and travel modes to tally.
- **Field Counter Screen**:
  - Tailored for mobile/tablet field counting.
  - High-frequency tapping support (5+ clicks per second) with instant visual feedback.
  - Undo button that reverts counts and removes the last recorded event.
  - Batched background synchronization with the server.
  - Confirmation dialog before ending the session.
- **Reporting & Export**:
  - **Raw Tally CSV**: Timestamps, observer names, mode, movement, approach headings.
  - **15-Minute Summary Matrix CSV**: Standard traffic survey table aggregated across multiple sessions and observers.

## Tech Stack
- **Backend**: Python 3.10+ (FastAPI, SQLAlchemy 2.0, SQLite WAL mode, Pydantic v2).
- **Frontend**: React 19, TypeScript, Bootstrap 5, Bootstrap Icons, Vite.

## Running the Application

### Local
1. Set two Environment Variables: `FLOWCOUNT_ADMIN_KEY` and optionally, `DATABASE_URL`. If `DATABASE_URL` is not set, `flow_counter.db` will be created at the project root.
2. If there are any front-end changes, build the front-end. From the `frontend` folder, run `node_modules\.bin\vite.cmd build`
3. Activate the virtual environment (`venv\Scripts\activate` on Windows, `. /venv/bin/activate` on linux)
4. Start the server: `python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000`

### Deploying
This project is deployed using fly.io
1. Install the flyctl cli app
1. create a new application using `fly launch`, I specifically did this: `fly launch --build-only -r iad`
1. after this I made some adjustments to the `.dockerignore` file
1. then I created a volume using `fly volume` to hold the sqlite files. Specifically I did `fly volumes create flowcounter_sqlite -s 1 -r iad`
1. made some adjustments to DB loctions and set some environment variables
1. ran `fly deploy --build-only` again to see if everything seems happy.
1. Looks good, so I ran `fly deploy`
1. After a couple of tweaks to the dockerfile `CMD` line and a few tweaks to the `fly.toml` to adjust the configuration, it's running.

To deploy new changes, make sure it looks good locally, then run `fly deploy`

### Maintenance
The flyctl has an sftp interface built in, so downloading the database for local inspection can be done that way. Note that you have wake up the app before you can connect via sftp.
```
fly status
fly m start {machineid}
fly ssh sftp get /data/tallies.db
fly ssh sftp get /data/tallies.db-wal
fly ssh sftp get /data/tallies.db-shm
```
or replace `tallies.db` with your database name as configured in your environment variable.


### Other / Old
Backend Dev
```bash
# In project root:
.\venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Frontend Dev - this doesn't work
```bash
cd frontend
npm run dev
```

Backend Tests
```bash
.\venv\Scripts\python.exe -m pytest tests
```

Frontend Tests
```bash
cd frontend
npm test (or npx vitest run)
```