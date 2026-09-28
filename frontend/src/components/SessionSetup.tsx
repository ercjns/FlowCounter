import React, { useState } from "react";
import type { IntersectionDetail, Movement, TravelMode } from "../types";
import { openSession, getExportRawUrl, getExportSummary15mUrl, downloadFile } from "../api";

interface Props {
  intersection: IntersectionDetail;
  onBack: () => void;
  onSessionStarted: (sessionId: string) => void;
}

/**
 * Build the initial per-movement mode selection map.
 * Defaults to all valid modes for each movement, or all modes if valid_mode_ids is empty.
 */
function buildDefaultMovementModes(
  movements: Movement[],
  modes: TravelMode[]
): Record<string, string[]> {
  const modeById = new Map(modes.map((m) => [m.id, m]));
  const result: Record<string, string[]> = {};
  for (const mov of movements) {
    if (mov.valid_mode_ids && mov.valid_mode_ids.length > 0) {
      // Only expose valid modes that actually exist on the intersection
      result[mov.id] = mov.valid_mode_ids.filter((id) => modeById.has(id));
    } else {
      result[mov.id] = modes.map((m) => m.id);
    }
  }
  return result;
}

export const SessionSetup: React.FC<Props> = ({ intersection, onBack, onSessionStarted }) => {
  const [counterName, setCounterName] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingRaw, setExportingRaw] = useState(false);
  const [exporting15m, setExporting15m] = useState(false);

  // Selected movements
  const [selectedMovements, setSelectedMovements] = useState<string[]>(
    intersection.movements.map((m) => m.id)
  );

  // Per-movement mode selection: movementId -> list of selected mode IDs
  const [movementModes, setMovementModes] = useState<Record<string, string[]>>(
    buildDefaultMovementModes(intersection.movements, intersection.modes)
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Movement selection ─────────────────────────────────────────────────────
  const toggleMovement = (id: string) => {
    setSelectedMovements((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };
  const selectAllMovements = () => setSelectedMovements(intersection.movements.map((m) => m.id));
  const deselectAllMovements = () => setSelectedMovements([]);

  // ── Per-movement mode helpers ──────────────────────────────────────────────
  /** The modes available for selection for a given movement (restricted to its valid_mode_ids) */
  function availableModesForMovement(mov: Movement): TravelMode[] {
    if (mov.valid_mode_ids && mov.valid_mode_ids.length > 0) {
      const validSet = new Set(mov.valid_mode_ids);
      return intersection.modes.filter((m) => validSet.has(m.id));
    }
    return intersection.modes;
  }

  const toggleModeForMovement = (movId: string, modeId: string) => {
    setMovementModes((prev) => {
      const current = prev[movId] ?? [];
      return {
        ...prev,
        [movId]: current.includes(modeId)
          ? current.filter((id) => id !== modeId)
          : [...current, modeId],
      };
    });
  };

  const selectAllModesForMovement = (movId: string, mov: Movement) => {
    setMovementModes((prev) => ({
      ...prev,
      [movId]: availableModesForMovement(mov).map((m) => m.id),
    }));
  };

  const deselectAllModesForMovement = (movId: string) => {
    setMovementModes((prev) => ({ ...prev, [movId]: [] }));
  };

  // ── Validation & submit ────────────────────────────────────────────────────
  const selectedMovementObjects = intersection.movements.filter((m) => selectedMovements.includes(m.id));

  const totalButtonCount = selectedMovementObjects.reduce((sum, mov) => {
    return sum + (movementModes[mov.id]?.length ?? 0);
  }, 0);

  const hasInvalidMovement = selectedMovementObjects.some(
    (mov) => (movementModes[mov.id]?.length ?? 0) === 0
  );

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterName.trim()) {
      setError("Please enter your name as the observer.");
      return;
    }
    if (selectedMovements.length === 0) {
      setError("Please select at least one movement to count.");
      return;
    }
    if (hasInvalidMovement) {
      setError("Every selected movement must have at least one travel mode selected.");
      return;
    }

    // Build movement_modes dict for selected movements only
    const movementModesPayload: Record<string, string[]> = {};
    for (const mov of selectedMovementObjects) {
      movementModesPayload[mov.id] = movementModes[mov.id] ?? [];
    }

    // Derive flat assigned lists for backend compatibility
    const assignedMovements = Object.keys(movementModesPayload);
    const assignedModes = [...new Set(Object.values(movementModesPayload).flat())];

    try {
      setLoading(true);
      setError(null);
      const session = await openSession(intersection.id, {
        counter_name: counterName.trim(),
        password: password.trim() || undefined,
        movement_modes: movementModesPayload,
        assigned_movements: assignedMovements,
        assigned_modes: assignedModes,
        notes: notes.trim() || undefined,
      });
      onSessionStarted(session.id);
    } catch (err: any) {
      setError(err.message || "Failed to open counting session");
    } finally {
      setLoading(false);
    }
  };

  const handleExportRaw = async () => {
    try {
      setExportingRaw(true);
      await downloadFile(getExportRawUrl(intersection.id), `traffic_raw_${intersection.name.replace(/\s+/g, "_")}.csv`);
    } catch (err: any) {
      alert("Failed to export raw CSV: " + err.message);
    } finally {
      setExportingRaw(false);
    }
  };

  const handleExport15m = async () => {
    try {
      setExporting15m(true);
      await downloadFile(getExportSummary15mUrl(intersection.id), `traffic_15min_summary_${intersection.name.replace(/\s+/g, "_")}.csv`);
    } catch (err: any) {
      alert("Failed to export 15m summary CSV: " + err.message);
    } finally {
      setExporting15m(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: "720px" }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>
          <i className="bi bi-arrow-left me-1"></i> Back to Intersections
        </button>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm fw-semibold"
          onClick={() => setShowExportModal(true)}
        >
          <i className="bi bi-download me-1"></i> Export Data
        </button>
      </div>

      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body">
          <h4 className="fw-bold mb-1">{intersection.name}</h4>
          {intersection.description && <p className="text-muted small mb-2">{intersection.description}</p>}
          <div className="d-flex gap-2 align-items-center mt-2">
            <span className="badge bg-light text-dark border">
              {intersection.approaches.length} Approaches
            </span>
            <span className="badge bg-light text-dark border">
              {intersection.movements.length} Movements
            </span>
            <span className="badge bg-light text-dark border">
              {intersection.modes.length} Modes
            </span>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-4">{error}</div>}

      <form onSubmit={handleOpen}>
        {/* Observer Details */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white fw-bold py-3">Observer Details</div>
          <div className="card-body">
            <div className="mb-3">
              <label htmlFor="counterNameInput" className="form-label fw-semibold">Your Name / Counter ID *</label>
              <input
                id="counterNameInput"
                type="text"
                className="form-control form-control-lg"
                placeholder="e.g., Alex Johnson"
                value={counterName}
                onChange={(e) => setCounterName(e.target.value)}
                required
              />
            </div>

            {intersection.has_password && (
              <div className="mb-3">
                <label htmlFor="sessionPasswordInput" className="form-label fw-semibold text-danger">
                  <i className="bi bi-lock-fill me-1"></i> Intersection Password Required *
                </label>
                <input
                  id="sessionPasswordInput"
                  type="password"
                  className="form-control"
                  placeholder="Enter intersection password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="mb-0">
              <label htmlFor="sessionNotesInput" className="form-label fw-semibold">Session Notes (Optional)</label>
              <input
                id="sessionNotesInput"
                type="text"
                className="form-control"
                placeholder="e.g., Weather clear, peak morning rush"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Movements & per-movement mode selection */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
            <span className="fw-bold">
              Movements &amp; Travel Modes ({selectedMovements.length}/{intersection.movements.length} selected)
            </span>
            <div className="btn-group btn-group-sm">
              <button type="button" className="btn btn-outline-secondary" onClick={selectAllMovements}>All</button>
              <button type="button" className="btn btn-outline-secondary" onClick={deselectAllMovements}>None</button>
            </div>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              Select which movements to count and, for each, which travel modes to record. Defaults to all valid modes per movement.
            </p>
            <div className="d-flex flex-column gap-3">
              {intersection.movements.map((mov) => {
                const isSelected = selectedMovements.includes(mov.id);
                const availableModes = availableModesForMovement(mov);
                const selectedModesForMov = movementModes[mov.id] ?? [];

                return (
                  <div
                    key={mov.id}
                    className={`border rounded p-3 transition ${isSelected ? "border-primary bg-primary-subtle" : "bg-light border-secondary-subtle"}`}
                  >
                    {/* Movement toggle header */}
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div
                        className="d-flex align-items-center gap-2"
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleMovement(mov.id)}
                      >
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ width: "18px", height: "18px" }}
                        />
                        <span className="fw-semibold text-dark">{mov.name}</span>
                        {mov.movement_type && (
                          <span className="badge bg-secondary-subtle text-secondary border small">{mov.movement_type}</span>
                        )}
                      </div>
                      {isSelected && (
                        <div className="btn-group btn-group-sm">
                          <button type="button" className="btn btn-outline-secondary" onClick={() => selectAllModesForMovement(mov.id, mov)}>All modes</button>
                          <button type="button" className="btn btn-outline-secondary" onClick={() => deselectAllModesForMovement(mov.id)}>None</button>
                        </div>
                      )}
                    </div>

                    {/* Mode checkboxes — only shown when movement is selected */}
                    {isSelected && (
                      <div className="d-flex flex-wrap gap-2 mt-2 pt-2 border-top">
                        {availableModes.map((mode) => {
                          const isModeSelected = selectedModesForMov.includes(mode.id);
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              className={`btn btn-sm ${isModeSelected ? "btn-primary" : "btn-outline-secondary"}`}
                              style={isModeSelected ? { backgroundColor: mode.color, borderColor: mode.color } : {}}
                              onClick={() => toggleModeForMovement(mov.id, mode.id)}
                            >
                              <span
                                className="d-inline-block rounded-circle me-1"
                                style={{ width: "8px", height: "8px", backgroundColor: isModeSelected ? "#fff" : (mode.color ?? "#0d6efd") }}
                              ></span>
                              {mode.name}
                            </button>
                          );
                        })}
                        {selectedModesForMov.length === 0 && (
                          <span className="text-danger small align-self-center">
                            <i className="bi bi-exclamation-triangle me-1"></i>Select at least one mode
                          </span>
                        )}
                      </div>
                    )}

                    {/* When deselected — show a summary */}
                    {!isSelected && (
                      <div className="text-muted small mt-1">
                        Click to include this movement in the counting session
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Open Session Button */}
        <div className="d-grid gap-2 mb-5">
          <button
            type="submit"
            className="btn btn-success btn-lg shadow-sm py-3 fw-bold"
            disabled={loading || selectedMovements.length === 0 || hasInvalidMovement}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Preparing Session...
              </>
            ) : (
              <>
                <i className="bi bi-clipboard-check me-1 fs-5"></i>
                Open Counting Session ({totalButtonCount} button{totalButtonCount !== 1 ? "s" : ""})
              </>
            )}
          </button>
        </div>
      </form>

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Export Intersection Data</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowExportModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <p className="text-muted small mb-3">
                  Download traffic data collected across all counting sessions for <strong>{intersection.name}</strong>.
                </p>

                <div className="d-grid gap-3">
                  <button
                    type="button"
                    className="btn btn-outline-primary py-3 text-start d-flex align-items-center justify-content-between"
                    onClick={handleExportRaw}
                    disabled={exportingRaw}
                  >
                    <div>
                      <div className="fw-bold fs-6">
                        <i className="bi bi-file-earmark-spreadsheet me-2 text-primary"></i>
                        Raw Tally Events (CSV)
                      </div>
                      <div className="text-muted small mt-1">
                        Every timestamped tally record with observer name, mode, movement, and compass headings.
                      </div>
                    </div>
                    <div>
                      {exportingRaw ? (
                        <span className="spinner-border spinner-border-sm" role="status"></span>
                      ) : (
                        <i className="bi bi-download fs-5"></i>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-success py-3 text-start d-flex align-items-center justify-content-between"
                    onClick={handleExport15m}
                    disabled={exporting15m}
                  >
                    <div>
                      <div className="fw-bold fs-6">
                        <i className="bi bi-grid-3x3 me-2 text-success"></i>
                        15-Minute Summary Matrix (CSV)
                      </div>
                      <div className="text-muted small mt-1">
                        Traffic engineering survey matrix aggregated by 15-minute time intervals across all modes and movements.
                      </div>
                    </div>
                    <div>
                      {exporting15m ? (
                        <span className="spinner-border spinner-border-sm" role="status"></span>
                      ) : (
                        <i className="bi bi-download fs-5"></i>
                      )}
                    </div>
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowExportModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};