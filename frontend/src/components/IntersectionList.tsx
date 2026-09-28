import React, { useEffect, useState } from "react";
import type { IntersectionSummary } from "../types";
import { fetchIntersections } from "../api";

interface Props {
  onSelectIntersection: (id: string) => void;
  onNewIntersection: () => void;
}

export const IntersectionList: React.FC<Props> = ({ onSelectIntersection, onNewIntersection }) => {
  const [intersections, setIntersections] = useState<IntersectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    try {
      setLoading(true);
      const data = await fetchIntersections();
      setIntersections(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load intersections");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4" style={{ maxWidth: "680px" }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="mb-0 fw-bold">Intersections</h3>
        <button className="btn btn-primary shadow-sm" onClick={onNewIntersection}>
          <i className="bi bi-plus-lg me-1"></i> Add Intersection
        </button>
      </div>

      <p className="text-muted small mb-4">
        Select an intersection to begin counting or export data.
      </p>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <button className="btn btn-sm btn-outline-danger" onClick={loadList}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <div className="text-muted mt-2 small">Loading intersections...</div>
        </div>
      ) : intersections.length === 0 ? (
        <div className="card shadow-sm border-0 text-center py-5 px-3">
          <div className="display-4 text-muted mb-3"><i className="bi bi-geo-alt"></i></div>
          <h5>No Intersections Yet</h5>
          <p className="text-muted mb-4">Create your first intersection to configure approaches, movements, and travel modes.</p>
          <div>
            <button className="btn btn-primary" onClick={onNewIntersection}>
              <i className="bi bi-plus-circle me-1"></i> Create Intersection
            </button>
          </div>
        </div>
      ) : (
        <div className="list-group shadow-sm">
          {intersections.map((intx) => (
            <button
              key={intx.id}
              onClick={() => onSelectIntersection(intx.id)}
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3 border-start-0 border-end-0"
            >
              <div>
                <div className="fw-semibold fs-5 text-dark mb-1">{intx.name}</div>
                {intx.description && (
                  <div className="text-muted small text-truncate" style={{ maxWidth: "320px" }}>
                    {intx.description}
                  </div>
                )}
                <div className="text-muted small mt-1">
                  Created {new Date(intx.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                {intx.has_password && (
                  <span className="badge bg-secondary-subtle text-secondary border">
                    <i className="bi bi-lock-fill me-1"></i> Observer Password Required
                  </span>
                )}
                <i className="bi bi-chevron-right text-muted"></i>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
