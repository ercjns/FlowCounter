import React, { useEffect, useState, useRef, useCallback } from "react";
import type { IntersectionDetail, SessionData, SessionStats, TravelMode } from "../types";
import {
  beginCounting,
  endSession,
  recordTalliesBatch,
  undoLastTally,
  fetchSessionStats,
  downloadFile,
  getExportRawUrl,
  getExportSummary15mUrl,
} from "../api";

interface Props {
  intersection: IntersectionDetail;
  session: SessionData;
  onEndSession: () => void;
}

interface LocalTallyAction {
  movement_id: string;
  mode_id: string;
  timestamp: string;
}

export const CountingField: React.FC<Props> = ({ intersection, session, onEndSession }) => {
  // ── Determine which movements/modes to show ────────────────────────────────
  const assignedMovements = intersection.movements.filter((m) =>
    session.assigned_movements.includes(m.id)
  );

  /**
   * Resolve which modes to show per movement.
   * If movement_modes is provided, use that per-movement list.
   * Otherwise fall back to the flat assigned_modes list.
   */
  function modesForMovement(movId: string): TravelMode[] {
    if (session.movement_modes && session.movement_modes[movId]) {
      const ids = new Set(session.movement_modes[movId]);
      return intersection.modes.filter((m) => ids.has(m.id));
    }
    return intersection.modes.filter((m) => session.assigned_modes.includes(m.id));
  }

  // ── Counting active state ──────────────────────────────────────────────────
  // isCounting is true once the user clicks "Start Counting"
  const [isCounting, setIsCounting] = useState(session.started_at !== null);
  const [startingCount, setStartingCount] = useState(false);

  // ── Stats state: key is `movId:modeId` ────────────────────────────────────
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [bucketTotals, setBucketTotals] = useState<Record<string, number>>({});
  const [currentBucketStr, setCurrentBucketStr] = useState<string>("");

  // ── Undo stack & sync queue ────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<LocalTallyAction[]>([]);
  const pendingBatchRef = useRef<LocalTallyAction[]>([]);
  const flushTimerRef = useRef<any>(null);

  // ── Animation trigger map ──────────────────────────────────────────────────
  const [pulseKey, setPulseKey] = useState<string | null>(null);

  // ── Session ending state ───────────────────────────────────────────────────
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endedInfo, setEndedInfo] = useState<SessionData | null>(null);
  const [exportingRaw, setExportingRaw] = useState(false);
  const [exporting15m, setExporting15m] = useState(false);

  // ── Flush pending batch to server ──────────────────────────────────────────
  const flushPendingBatch = useCallback(async () => {
    if (pendingBatchRef.current.length === 0) return;
    const batch = [...pendingBatchRef.current];
    pendingBatchRef.current = [];

    try {
      await recordTalliesBatch(session.id, batch);
    } catch (err) {
      console.error("Batch sync failed, re-queueing", err);
      pendingBatchRef.current = [...batch, ...pendingBatchRef.current];
    }
  }, [session.id]);

  // ── Periodic flush & background stats refresh ──────────────────────────────
  useEffect(() => {
    const syncInterval = setInterval(() => {
      flushPendingBatch();
    }, 15*1000); //was 1500

    const statsInterval = setInterval(async () => {
      try {
        const stats: SessionStats = await fetchSessionStats(session.id);
        setCurrentBucketStr(stats.current_bucket_str);
        setTotals((prev) => ({ ...stats.totals, ...prev }));
        setBucketTotals((prev) => ({ ...stats.bucket_15m_totals, ...prev }));
      } catch (e) {
        // silent catch
      }
    }, 30*1000); //was 10*1000

    // Initial load
    fetchSessionStats(session.id)
      .then((stats) => {
        setTotals(stats.totals || {});
        setBucketTotals(stats.bucket_15m_totals || {});
        setCurrentBucketStr(stats.current_bucket_str);
      })
      .catch(() => {});

    return () => {
      clearInterval(syncInterval);
      clearInterval(statsInterval);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushPendingBatch();
    };
  }, [session.id, flushPendingBatch]);
  
  // ── Abandon Session (EJ) ───────────────────────────────────────────────────
  const handleAbandon = async () => {
    try {
      await endSession(session.id);
    } catch (err: any) {
      alert("Failed to abandon counting session: " + err.message);
    } finally {
      setEndedInfo({
        id: 'abandoned',
        intersection_id: session.intersection_id,
        counter_name: session.counter_name,
        started_at: null,
        ended_at: null,
        assigned_modes: [],
        assigned_movements: [],
        movement_modes: null,
      })
    }
  };


  // ── Start counting ─────────────────────────────────────────────────────────
  const handleStartCounting = async () => {
    try {
      setStartingCount(true);
      await beginCounting(session.id);
      setIsCounting(true);
    } catch (err: any) {
      alert("Failed to start counting: " + err.message);
    } finally {
      setStartingCount(false);
    }
  };

  // ── High-throughput click handler ──────────────────────────────────────────
  const handleTallyClick = (movementId: string, modeId: string) => {
    if (!isCounting) return;
    const key = `${movementId}:${modeId}`;
    const now = new Date().toISOString();

    // 1. Optimistic instant increment (0ms UI latency)
    setTotals((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setBucketTotals((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));

    // 2. Micro-visual pulse animation
    setPulseKey(key);
    setTimeout(() => setPulseKey((cur) => (cur === key ? null : cur)), 120);

    // 3. Push to undo stack
    const action: LocalTallyAction = { movement_id: movementId, mode_id: modeId, timestamp: now };
    setUndoStack((prev) => [...prev, action]);

    // 4. Push to background batch sync
    pendingBatchRef.current.push(action);

    // Debounce rapid sync
    if (pendingBatchRef.current.length >= 5) {
      flushPendingBatch();
    } else {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushPendingBatch, 1000);
    }
  };

  // ── Undo last action ───────────────────────────────────────────────────────
  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    const key = `${lastAction.movement_id}:${lastAction.mode_id}`;
    setTotals((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 1) - 1) }));
    setBucketTotals((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 1) - 1) }));

    const bufferIdx = pendingBatchRef.current.findLastIndex(
      (a) => a.movement_id === lastAction.movement_id && a.mode_id === lastAction.mode_id
    );
    if (bufferIdx !== -1) {
      pendingBatchRef.current.splice(bufferIdx, 1);
    } else {
      try {
        await flushPendingBatch();
        await undoLastTally(session.id);
      } catch (err) {
        console.error("Undo error on server:", err);
      }
    }
  };

  // ── End Session ────────────────────────────────────────────────────────────
  const handleConfirmEnd = async () => {
    try {
      setEnding(true);
      await flushPendingBatch();
      const updated = await endSession(session.id);
      setEndedInfo(updated);
    } catch (err: any) {
      alert("Error ending session: " + err.message);
    } finally {
      setEnding(false);
      setConfirmEnd(false);
    }
  };

  const handleExportRaw = async () => {
    try {
      setExportingRaw(true);
      await downloadFile(
        getExportRawUrl(intersection.id),
        `traffic_raw_${intersection.name.replace(/\s+/g, "_")}.csv`
      );
    } catch (err: any) {
      alert("Failed to export raw CSV: " + err.message);
    } finally {
      setExportingRaw(false);
    }
  };

  const handleExport15m = async () => {
    try {
      setExporting15m(true);
      await downloadFile(
        getExportSummary15mUrl(intersection.id),
        `traffic_15min_summary_${intersection.name.replace(/\s+/g, "_")}.csv`
      );
    } catch (err: any) {
      alert("Failed to export 15m summary: " + err.message);
    } finally {
      setExporting15m(false);
    }
  };

  // ── Session completed screen ───────────────────────────────────────────────
  if (endedInfo) {
    const grandTotal = Object.values(totals).reduce((sum, c) => sum + c, 0);

    return (
      <div className="container py-5" style={{ maxWidth: "600px" }}>
        <div className="card shadow border-0 text-center p-4">
          <div className="text-success display-4 mb-3">
            <i className="bi bi-check-circle-fill"></i>
          </div>
          <h3 className="fw-bold">Counting Session Completed</h3>
          <p className="text-muted">
            Observer: <strong>{session.counter_name}</strong> at <strong>{intersection.name}</strong>
          </p>

          <div className="alert alert-light border my-3 py-3">
            <div className="fs-1 fw-bold text-primary">{grandTotal}</div>
            <div className="text-muted small">Total Recorded Events in This Session</div>
          </div>

          <div className="text-start small text-muted mb-4">
            <div>Started: {endedInfo.started_at ? new Date(endedInfo.started_at).toLocaleString() : "—"}</div>
            <div>Ended: {endedInfo.ended_at ? new Date(endedInfo.ended_at).toLocaleString() : ""}</div>
          </div>

          {/* Direct Export Buttons on Completion Screen */}
          <div className="card bg-light border mb-4 text-start p-3">
            <div className="fw-bold mb-2 text-dark">Export Intersection Data</div>
            <div className="d-grid gap-2">
              <button
                className="btn btn-outline-primary text-start d-flex align-items-center justify-content-between"
                onClick={handleExportRaw}
                disabled={exportingRaw}
              >
                <span>
                  <i className="bi bi-file-earmark-spreadsheet me-2"></i>
                  {exportingRaw ? "Downloading Raw CSV..." : "Export Raw Events (CSV)"}
                </span>
                <i className="bi bi-download"></i>
              </button>

              <button
                className="btn btn-outline-success text-start d-flex align-items-center justify-content-between"
                onClick={handleExport15m}
                disabled={exporting15m}
              >
                <span>
                  <i className="bi bi-grid-3x3 me-2"></i>
                  {exporting15m ? "Downloading Summary CSV..." : "Export 15-Minute Summary Matrix (CSV)"}
                </span>
                <i className="bi bi-download"></i>
              </button>
            </div>
          </div>

          <div className="d-grid gap-2">
            <button className="btn btn-primary btn-lg" onClick={onEndSession}>
              Return to Intersection Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active counting page ───────────────────────────────────────────────────
  return (
    <div className="container-fluid px-2 px-md-4 py-3" style={{ maxWidth: "900px" }}>
      {/* Top Status Bar */}
      <div className="card shadow-sm border-0 mb-3 bg-white">
        <div className="card-body p-2 p-md-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <span className="fw-semibold text-dark d-none d-sm-inline">{intersection.name}</span>
              <span className="me-2 text-small">Observer: {session.counter_name}</span>
            </div>

            <div className="d-flex align-items-center gap-2">
              {isCounting ? (
                <>
                  <button
                    className="btn btn-outline-warn btn-sm px-3 fw-bold d-flex align-items-center"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    title="Undo last recorded tally"
                  >
                    <i className="bi bi-arrow-counterclockwise me-1"></i> Undo
                    {/* {undoStack.length > 0 && (
                      <span className="badge bg-danger ms-1">{undoStack.length}</span>
                    )} */}
                  </button>

                  <button
                    className="btn btn-danger btn-sm fw-semibold"
                    onClick={() => setConfirmEnd(true)}
                  >
                    Stop Counting
                  </button>
                </>
              ) : (
                <>
                <button
                  className="btn btn-warn btn-sm fw-semibold px-3"
                  onClick={handleAbandon}
                  disabled={startingCount}
                  >
                  Cancel
                </button>
                <button
                  className="btn btn-success btn-sm fw-semibold px-3"
                  onClick={handleStartCounting}
                  disabled={startingCount}
                >
                  {startingCount ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                      Starting...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-play-fill me-1"></i> Start Counting
                    </>
                  )}
                </button>
                </>
              )}
            </div>
          </div>

          {!isCounting && (
            <div className="alert alert-info py-2 px-3 mt-2 mb-0 small d-flex align-items-center gap-2">
              <i className="bi bi-info-circle-fill fs-5"></i>
              <span>Looks ok? Press <strong>Start Counting</strong> when you are ready to begin.</span>
            </div>
          )}

          {isCounting && currentBucketStr && (
            <div className="text-muted small mt-2 d-flex justify-content-between align-items-center">
              <span>
                <i className="bi bi-clock me-1"></i> Current Interval: <strong>{currentBucketStr}</strong>
              </span>
              <span className="badge bg-light text-secondary border">
                Total: {Object.values(totals).reduce((s, c) => s + c, 0)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Button Grid grouped by Movement */}
      <div className="d-flex flex-column gap-3 pb-5">
        {assignedMovements.map((mov) => {
          const movModes = modesForMovement(mov.id);
          return (
            <div key={mov.id} className={`card shadow-sm border-0 ${!isCounting ? "opacity-75" : ""}`}>
              <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                <span className="fw-bold text-dark fs-6">{mov.name}</span>
                {mov.movement_type && (
                  <span className="badge bg-light text-dark border small">{mov.movement_type}</span>
                )}
              </div>
              <div className="card-body p-2">
                <div className="row g-2">
                  {movModes.map((mode) => {
                    const key = `${mov.id}:${mode.id}`;
                    const countTotal = totals[key] || 0;
                    const count15m = bucketTotals[key] || 0;
                    const isPulsing = pulseKey === key;

                    return (
                      <div key={mode.id} className="col-4 col-lg-2">
                        <button
                          type="button"
                          className={`btn w-100 p-1 tally-btn border ${
                            isPulsing ? "tally-btn-pulse border-primary shadow" : "shadow-sm"
                          }`}
                          style={{
                            backgroundColor: "#ffffff",
                            borderTop: `4px solid ${mode.color || "#0d6efd"}`,
                            cursor: isCounting ? "pointer" : "not-allowed",
                          }}
                          onClick={() => handleTallyClick(mov.id, mode.id)}
                          disabled={!isCounting}
                        >
                          <div
                            className="fw-bold text-truncate small mb-1"
                            style={{ color: mode.color || "#0d6efd" }}
                            title={mode.name}
                          >
                            {mode.name}
                          </div>

                          <div className="fs-3 fw-bolder text-dark lh-1 my-1">
                            {countTotal}
                          </div>

                          {/* <div className="d-flex justify-content-center">
                            <span className="badge bg-secondary-subtle text-secondary border badge-15m">
                              15m: {count15m}
                            </span>
                          </div> */}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* End Session Confirmation Modal */}
      {confirmEnd && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Stop Counting Session?</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setConfirmEnd(false)}
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-1">
                  Are you sure you want to finish counting for <strong>{session.counter_name}</strong>?
                </p>
                <p className="text-muted small mb-0">
                  Once ended, all records will be saved and you will be able to review the session summary. No further tallies can be added.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setConfirmEnd(false)}
                  disabled={ending}
                >
                  Continue Counting
                </button>
                <button
                  type="button"
                  className="btn btn-danger fw-bold"
                  onClick={handleConfirmEnd}
                  disabled={ending}
                >
                  {ending ? "Saving..." : "Confirm & End"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};