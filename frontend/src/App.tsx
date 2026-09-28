import { useState, useEffect } from "react";
import type { IntersectionDetail, SessionData } from "./types";
import { fetchIntersection, fetchSession } from "./api";
import { IntersectionList } from "./components/IntersectionList";
import { IntersectionWizard } from "./components/IntersectionWizard";
import { SessionSetup } from "./components/SessionSetup";
import { CountingField } from "./components/CountingField";

type ViewMode = "list" | "wizard" | "setup" | "counting";

export function App() {
  const [view, setView] = useState<ViewMode>("list");
  const [selectedIntersectionId, setSelectedIntersectionId] = useState<string | null>(null);
  const [intersection, setIntersection] = useState<IntersectionDetail | null>(null);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load intersection details when selected
  useEffect(() => {
    if (selectedIntersectionId) {
      setLoading(true);
      fetchIntersection(selectedIntersectionId)
        .then((data) => {
          setIntersection(data);
          setView("setup");
        })
        .catch((err) => {
          alert("Error loading intersection: " + err.message);
          setView("list");
        })
        .finally(() => setLoading(false));
    }
  }, [selectedIntersectionId]);

  const handleSelectIntersection = (id: string) => {
    setSelectedIntersectionId(id);
  };

  const handleSessionStarted = async (sessionId: string) => {
    try {
      setLoading(true);
      const session = await fetchSession(sessionId);
      setActiveSession(session);
      setView("counting");
    } catch (err: any) {
      alert("Error loading started session: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-body-tertiary">
      {/* Top Navbar */}
      <nav className="navbar navbar-expand bg-white border-bottom shadow-sm sticky-top">
        <div className="container-fluid px-3">
          <span
            className="navbar-brand fw-bolder text-primary d-flex align-items-center mb-0"
            style={{ cursor: "pointer" }}
            onClick={() => {
              if (view === "counting") {
                if (confirm("Counting session is currently in progress. Return to home screen?")) {
                  setView("list");
                }
              } else {
                setView("list");
              }
            }}
          >
            <i className="bi bi-compass me-2 fs-4"></i> FlowCounter
          </span>

          <span className="navbar-text text-muted small d-none d-sm-inline">
            Multi-Modal Traffic Flow Tally
          </span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-grow-1">
        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}

        {!loading && view === "list" && (
          <IntersectionList
            onSelectIntersection={handleSelectIntersection}
            onNewIntersection={() => setView("wizard")}
          />
        )}

        {!loading && view === "wizard" && (
          <IntersectionWizard
            onCancel={() => setView("list")}
            onCreated={(id) => {
              setSelectedIntersectionId(id);
            }}
          />
        )}

        {!loading && view === "setup" && intersection && (
          <SessionSetup
            intersection={intersection}
            onBack={() => {
              setSelectedIntersectionId(null);
              setIntersection(null);
              setView("list");
            }}
            onSessionStarted={handleSessionStarted}
          />
        )}

        {!loading && view === "counting" && intersection && activeSession && (
          <CountingField
            intersection={intersection}
            session={activeSession}
            onEndSession={() => {
              setActiveSession(null);
              setView("setup");
            }}
          />
        )}
      </main>

      <footer className="footer mt-auto py-2 bg-white border-top text-center text-muted small">
        FlowCounter
      </footer>
    </div>
  );
}

export default App;
