import React, { useState } from "react";
import { createIntersection } from "../api";

interface Props {
  onCancel: () => void;
  onCreated: (id: string) => void;
}

interface ApproachInput {
  name: string;
  type: "entry" | "exit" | "bike" | "sidewalk";
  compass_degrees?: number;
}

interface MovementInput {
  name: string;
  entry_approach_index: number;
  exit_approach_index: number;
  movement_type: string;
  valid_mode_indices: number[]; // indices into modes array
}

interface ModeInput {
  name: string;
  color: string;
}

const DEFAULT_MODES: ModeInput[] = [
  { name: "Moto", color: "#8820e3" },
  { name: "Car", color: "#d82512" },
  { name: "Van", color: "#d6760e" },
  { name: "Truck", color: "#6b7177" },
  { name: "Bus", color: "#c6b601" },
  { name: "Pedestrian", color: "#1154d1" },
  { name: "Bicycle", color: "#198754" },
  { name: "Scooter", color: "#17a2a9" },
];

export const IntersectionWizard: React.FC<Props> = ({ onCancel, onCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");

  const [approaches, setApproaches] = useState<ApproachInput[]>([
    // { name: "North Entry", compass_degrees: 0, type: "entry" },
    // { name: "East Exit", compass_degrees: 90, type: "exit" },
    // { name: "South Exit", compass_degrees: 180, type: "exit" },
    // { name: "West Entry", compass_degrees: 270, type: "entry" },
  ]);

  const [modes, setModes] = useState<ModeInput[]>(DEFAULT_MODES);

  const [movements, setMovements] = useState<MovementInput[]>([
    // { name: "SB Thru", entry_approach_index: 0, exit_approach_index: 2, movement_type: "thru", valid_mode_indices: [] },
    // { name: "WB Right", entry_approach_index: 3, exit_approach_index: 2, movement_type: "right", valid_mode_indices: [] },
    // { name: "WB Thru", entry_approach_index: 3, exit_approach_index: 1, movement_type: "thru", valid_mode_indices: [] },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived helpers
  const originApproaches = approaches.map((a, i) => ({ ...a, index: i })).filter((a) => a.type !== "exit");
  const destinationApproaches = approaches.map((a, i) => ({ ...a, index: i })).filter((a) => a.type !== "entry");
  const sidewalkApproahces = approaches.map((a, i) => ({ ...a, index: i })).filter((a) => a.type === "sidewalk");
  const bikeApproahces = approaches.map((a, i) => ({ ...a, index: i })).filter((a) => a.type === "bike");
  const exitApproaches = approaches.map((a, i) => ({ ...a, index: i })).filter((a) => a.type === "exit");

  // ── Approach Handlers ──────────────────────────────────────────────────────
  const addApproach = () => {
    setApproaches([...approaches, { name: "New Approach", compass_degrees: 0, type: "entry" }]);
  };

  const removeApproach = (idx: number) => {
    // Remap movement indices after removal
    setMovements((prev) =>
      prev.map((mov) => ({
        ...mov,
        entry_approach_index:
          mov.entry_approach_index === idx
            ? 0
            : mov.entry_approach_index > idx
            ? mov.entry_approach_index - 1
            : mov.entry_approach_index,
        exit_approach_index:
          mov.exit_approach_index === idx
            ? 0
            : mov.exit_approach_index > idx
            ? mov.exit_approach_index - 1
            : mov.exit_approach_index,
      }))
    );
    setApproaches(approaches.filter((_, i) => i !== idx));
  };

  const updateApproach = (idx: number, field: keyof ApproachInput, value: any) => {
    const updated = [...approaches];
    updated[idx] = { ...updated[idx], [field]: value };
    setApproaches(updated);
  };

  // ── Mode Handlers ──────────────────────────────────────────────────────────
  const addMode = () => {
    setModes([...modes, { name: "New Mode", color: "#0dcaf0" }]);
  };

  const removeMode = (idx: number) => {
    // Remove this mode index from all movement valid_mode_indices
    setMovements((prev) =>
      prev.map((mov) => ({
        ...mov,
        valid_mode_indices: mov.valid_mode_indices
          .filter((mi) => mi !== idx)
          .map((mi) => (mi > idx ? mi - 1 : mi)),
      }))
    );
    setModes(modes.filter((_, i) => i !== idx));
  };

  const updateMode = (idx: number, field: keyof ModeInput, value: string) => {
    const updated = [...modes];
    updated[idx] = { ...updated[idx], [field]: value };
    setModes(updated);
  };

  // ── Movement Handlers ──────────────────────────────────────────────────────
  const addMovement = () => {
    const entryIdx = originApproaches[0]?.index ?? 0;
    const exitIdx = destinationApproaches[0]?.index ?? 0;
    setMovements([
      ...movements,
      {
        name: "New Movement",
        entry_approach_index: entryIdx,
        exit_approach_index: exitIdx,
        movement_type: "thru",
        valid_mode_indices: modes.map((_, i) => i), // default all modes
      },
    ]);
  };

  const removeMovement = (idx: number) => {
    setMovements(movements.filter((_, i) => i !== idx));
  };

  const updateMovement = (idx: number, field: keyof Omit<MovementInput, "valid_mode_indices">, value: any) => {
    const updated = [...movements];
    updated[idx] = { ...updated[idx], [field]: value };
    setMovements(updated);
  };

  const toggleMovementMode = (movIdx: number, modeIdx: number) => {
    const updated = [...movements];
    const current = updated[movIdx].valid_mode_indices;
    updated[movIdx] = {
      ...updated[movIdx],
      valid_mode_indices: current.includes(modeIdx)
        ? current.filter((mi) => mi !== modeIdx)
        : [...current, modeIdx].sort((a, b) => a - b),
    };
    setMovements(updated);
  };

  const selectAllModesForMovement = (movIdx: number) => {
    const updated = [...movements];
    updated[movIdx] = { ...updated[movIdx], valid_mode_indices: modes.map((_, i) => i) };
    setMovements(updated);
  };

  const deselectAllModesForMovement = (movIdx: number) => {
    const updated = [...movements];
    updated[movIdx] = { ...updated[movIdx], valid_mode_indices: [] };
    setMovements(updated);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide an intersection name");
      return;
    }
    if (approaches.length === 0) {
      setError("Please define at least one approach");
      return;
    }
    if (originApproaches.length === 0) {
      setError("Please define at least one entry approach");
      return;
    }
    if (exitApproaches.length === 0 && bikeApproahces.length === 0 && sidewalkApproahces.length === 0) {
      setError("Please define at least one exit approach");
      return;
    }
    if (modes.length === 0) {
      setError("Please define at least one travel mode");
      return;
    }
    if (movements.length === 0) {
      setError("Please define at least one movement flow");
      return;
    }
    for (let i = 0; i < movements.length; i++) {
      if (movements[i].valid_mode_indices.length === 0) {
        setError(`Movement "${movements[i].name}" must have at least one valid travel mode`);
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        // adminKey: adminKey.trim(), //new
        name: name.trim(),
        description: description.trim() || undefined,
        password: password.trim() || undefined,
        approaches: approaches.map((app) => ({
          name: app.name.trim(),
          compass_degrees: Number(app.compass_degrees),
          type: app.type,
        })),
        modes: modes.map((m, idx) => ({
          name: m.name.trim(),
          color: m.color,
          sort_order: idx + 1,
        })),
        movements: movements.map((mov) => ({
          name: mov.name.trim(),
          entry_approach_id: String(mov.entry_approach_index),
          exit_approach_id: String(mov.exit_approach_index),
          movement_type: mov.movement_type,
          valid_mode_ids: mov.valid_mode_indices.map((mi) => modes[mi]?.name || String(mi)),
        })),
      };

      const created = await createIntersection(payload);
      onCreated(created.id);
    } catch (err: any) {
      setError(err.message || "Failed to create intersection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: "780px" }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0 fw-bold">New Intersection Setup</h3>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>

        {/* ── Section 1: Basic Info ───────────────────────────────────────── */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white fw-bold py-3">1. General Information</div>
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label fw-semibold">Intersection Name *</label>
              <input
                type="text"
                className="form-control form-control-lg"
                placeholder="Main St & 4th Ave"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Description / Notes</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Includes two way bikeway along fourth"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <label className="form-label fw-semibold">
                Observer Password <span className="text-muted fw-normal">(Optional)</span>
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="share this password with trusted observers"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="form-text">If set, observers must enter this password before starting a count.</div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Approaches ───────────────────────────────────────── */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
            <span className="fw-bold">2. Approaches</span>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              Define the legs of the intersection.<br />
              For <strong>normal vehicle lanes</strong>, define separate entry and exit approaches.<br />
              <strong>Bike lane</strong> approaches do not have an inherent direction, use the movement definition to establish valid direction(s).<br />
              <strong>Sidewalk</strong> approaches typically represent a corner from which a pedestrian could cross to another sidewalk approach.
            </p>

            <div className="table-responsive">
              <table className="table align-middle table-bordered table-hover">
                <thead className="table-light small">
                  <tr>
                    <th style={{ width: "40px" }}>#</th>
                    <th style={{ width: "150px" }}>Type</th>
                    <th>Approach Name</th>
                    {/* <th style={{ width: "130px" }}>Heading (0–359°)</th> */}
                    <th style={{ width: "60px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {approaches.map((app, idx) => (
                    <tr key={idx}>
                      <td className="text-center text-muted fw-semibold small">{idx + 1}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={app.type}
                          onChange={(e) => updateApproach(idx, "type", e.target.value as "entry" | "exit" | "bike" | "sidewalk")}
                        >
                          <option value="entry">Vehicle Entry</option>
                          <option value="exit">Vehicle Exit</option>
                          <option value="bike">Bike Lane</option>
                          <option value="sidewalk">Sidewalk</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={app.name}
                          onChange={(e) => updateApproach(idx, "name", e.target.value)}
                          placeholder="e.g. Northbound Entry"
                          required
                        />
                      </td>
                      {/* <td>
                        <input
                          type="number"
                          min="0"
                          max="359"
                          className="form-control form-control-sm text-center"
                          value={app.compass_degrees}
                          onChange={(e) => updateApproach(idx, "compass_degrees", parseInt(e.target.value) || 0)}
                          required
                        />
                      </td> */}
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-link text-danger p-0"
                          onClick={() => removeApproach(idx)}
                          disabled={approaches.length <= 1}
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={addApproach}>
              <i className="bi bi-plus me-1"></i> Add Approach
              </button>
            </div>

            {originApproaches.length === 0 && (
              <div className="alert alert-warning small py-2 mb-0">
                <i className="bi bi-exclamation-triangle me-1"></i> At least one <strong>Entry</strong> approach is required for movements.
              </div>
            )}
            {exitApproaches.length === 0 && bikeApproahces.length === 0 && sidewalkApproahces.length === 0 && (
              <div className="alert alert-warning small py-2 mb-0">
                <i className="bi bi-exclamation-triangle me-1"></i> At least one <strong>Exit</strong> approach is required for movements.
              </div>
            )}
          </div>
        </div>

        {/* ── Section 3: Travel Modes ─────────────────────────────────────── */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
            <span className="fw-bold">3. Travel Modes</span>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              List every mode to be counted at this intersection.
            </p>

            <div className="row g-2">
              {modes.map((m, idx) => (
                <div key={idx} className="col-6">
                  <div className="input-group">
                    <input
                      type="color"
                      className="form-control form-control-color"
                      style={{ maxWidth: "48px" }}
                      value={m.color}
                      onChange={(e) => updateMode(idx, "color", e.target.value)}
                      title="Mode color"
                    />
                    <input
                      type="text"
                      className="form-control"
                      value={m.name}
                      onChange={(e) => updateMode(idx, "name", e.target.value)}
                      placeholder="Mode name"
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      onClick={() => removeMode(idx)}
                      disabled={modes.length <= 1}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="row my-2">
              <div className="col-12">
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={addMode}>
                  <i className="bi bi-plus me-1"></i> Add Mode
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 4: Intersection Movements ──────────────────────────── */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
            <span className="fw-bold">4. Movements</span>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              Define each movement (flow) to be counted. A vehicle flow always moves from an <strong>entry</strong> approach to an <strong>exit</strong> approach. Bike and Pedestrian flows can go to any other approach. Be sure to define <strong>each direction separately</strong>! A flow may be valid for all modes, or may be limited to a selected set of travel modes.
            </p>

            {movements.length === 0 ? (
              <p className="text-muted text-center py-3">No movements defined yet. Click "Add Movement" to begin.</p>
            ) : (
              <div className="d-flex flex-column gap-3">
                {movements.map((mov, movIdx) => (
                  <div key={movIdx} className="border rounded p-2 bg-light">
                    {/* Movement header row */}
                    <div className="row g-2 align-items-end pt-2">
                      <div className="col-12 col-sm-6">
                        <label className="form-label small fw-semibold mb-1">Movement Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={mov.name}
                          onChange={(e) => updateMovement(movIdx, "name", e.target.value)}
                          placeholder="NB Thru"
                          required
                        />
                      </div>
                      <div className="col-4 col-sm-4">
                        <label className="form-label small fw-semibold mb-1">Type</label>
                        <select
                          className="form-select form-select-sm"
                          value={mov.movement_type}
                          onChange={(e) => updateMovement(movIdx, "movement_type", e.target.value)}
                        >
                          <option value="thru">Thru</option>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                          <option value="uturn">U-Turn</option>
                          <option value="cross">Crossing</option>
                          
                        </select>
                      </div>
                      <div className="col-1">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => removeMovement(movIdx)}
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                    <div className="row g-2 align-items-end pt-2">
                      <div className="col-6 col-sm-5">
                        <label className="form-label small fw-semibold mb-1">
                          From / Entry
                        </label>
                        <select
                          className="form-select form-select-sm"
                          value={mov.entry_approach_index}
                          onChange={(e) => updateMovement(movIdx, "entry_approach_index", parseInt(e.target.value))}
                        >
                          {originApproaches.map((app) => (
                            <option key={app.index} value={app.index}>
                              #{app.index + 1} {app.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-1">
                        <i className="bi bi-arrow-right"></i>
                        <i className="bi bi-arrow-right"></i>
                        <i className="bi bi-arrow-right"></i>
                      </div>
                      <div className="col-6 col-sm-5">
                        <label className="form-label small fw-semibold mb-1">
                          To / Exit
                        </label>
                        <select
                          className="form-select form-select-sm"
                          value={mov.exit_approach_index}
                          onChange={(e) => updateMovement(movIdx, "exit_approach_index", parseInt(e.target.value))}
                        >
                          {destinationApproaches.map((app) => (
                            <option key={app.index} value={app.index}>
                              #{app.index + 1} {app.name}
                            </option>
                          ))}
                        </select>
                      </div>

                    </div>

                    {/* Valid modes for this movement */}
                    <div className="row pt-2">
                      <div className="d-flex align-items-center mb-2">
                        <span className="small fw-semibold text-dark px-2">
                          Valid Travel Modes
                        </span>
                        <div className="btn-group btn-group-sm px-1">
                          <button type="button" className="btn btn-link" onClick={() => selectAllModesForMovement(movIdx)}>All</button>
                          <button type="button" className="btn btn-link" onClick={() => deselectAllModesForMovement(movIdx)}>None</button>
                        </div>
                        <div className="px-1">
                          {mov.valid_mode_indices.length === 0 && (
                            <span className="text-danger ms-2 small px-1">⚠ Select at least one</span>
                          )}
                        </div>
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        {modes.map((mode, modeIdx) => {
                          const isSelected = mov.valid_mode_indices.includes(modeIdx);
                          return (
                            <button
                              key={modeIdx}
                              type="button"
                              className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-outline-secondary"}`}
                              style={isSelected ? { backgroundColor: mode.color, borderColor: mode.color } : {}}
                              onClick={() => toggleMovementMode(movIdx, modeIdx)}
                            >
                              <span
                                className="d-inline-block rounded-circle me-1"
                                style={{ width: "8px", height: "8px", backgroundColor: isSelected ? "#fff" : mode.color }}
                              ></span>
                              {mode.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="row mt-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={addMovement}
                disabled={originApproaches.length === 0 || destinationApproaches.length === 0}
              >
                <i className="bi bi-plus me-1"></i> Add Movement
              </button>
            </div>
          </div>
        </div>

        {/* ── Submit ─────────────────────────────────────────────────────── */}
        <div className="d-grid gap-2 mb-5">
          <p>Double check your configuration before saving!! 
            There is not a way to edit your configuration after saving it!</p>
        </div>
        <div className="d-grid gap-2 mb-5">
          <button type="submit" className="btn btn-primary btn-lg shadow-sm" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Saving Intersection...
              </>
            ) : (
              <>
                <i className="bi bi-check2-circle me-1"></i> Save Intersection Configuration
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
