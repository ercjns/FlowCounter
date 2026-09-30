import type { IntersectionSummary, IntersectionDetail, SessionData, SessionStats } from "./types";

// In browser, relative "/api" works cleanly for unified host (port 8000), or fallback to VITE_API_BASE
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== "undefined" && window.location.port === "5173" ? "http://localhost:8000/api" : "/api");

export async function fetchIntersections(): Promise<IntersectionSummary[]> {
  const res = await fetch(`${API_BASE}/intersections`);
  if (!res.ok) throw new Error("Failed to load intersections");
  return res.json();
}

export async function fetchIntersection(id: string): Promise<IntersectionDetail> {
  const res = await fetch(`${API_BASE}/intersections/${id}`);
  if (!res.ok) throw new Error("Failed to load intersection details");
  return res.json();
}

export async function verifyPassword(id: string, password?: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/intersections/${id}/verify-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password || "" }),
  });
  return res.ok;
}

export async function createIntersection(data: any): Promise<IntersectionDetail> {
  const res = await fetch(`${API_BASE}/intersections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create intersection");
  }
  return res.json();
}

export async function openSession(
  intersectionId: string,
  data: {
    counter_name: string;
    password?: string;
    movement_modes: Record<string, string[]>;
    assigned_movements: string[];
    assigned_modes: string[];
    notes?: string;
  }
): Promise<SessionData> {
  const res = await fetch(`${API_BASE}/intersections/${intersectionId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to open session");
  }
  return res.json();
}

// Keep startSession as alias for legacy compatibility
export const startSession = openSession;

export async function beginCounting(sessionId: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to start counting");
  return res.json();
}

export async function fetchSession(sessionId: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error("Failed to load session");
  return res.json();
}

export async function endSession(sessionId: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to end session");
  return res.json();
}
// Function has no references...
// export async function recordTally(sessionId: string, movementId: string, modeId: string) {
//   const res = await fetch(`${API_BASE}/sessions/${sessionId}/tallies`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ movement_id: movementId, mode_id: modeId }),
//   });
//   if (!res.ok) throw new Error("Failed to record tally");
//   return res.json();
// }

export async function recordTalliesBatch(sessionId: string, events: { movement_id: string; mode_id: string; timestamp?: string }[]) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/tallies/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new Error("Failed to record batch tallies");
  return res.json();
}

export async function undoLastTally(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/tallies/last`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to undo tally");
  return res.json();
}

export async function fetchSessionStats(sessionId: string): Promise<SessionStats> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/stats`);
  if (!res.ok) throw new Error("Failed to fetch session stats");
  return res.json();
}

export function getExportRawUrl(intersectionId: string, sessionIds?: string[]): string {
  let url = `${API_BASE}/intersections/${intersectionId}/export/raw`;
  if (sessionIds && sessionIds.length > 0) {
    const params = sessionIds.map((id) => `session_ids=${encodeURIComponent(id)}`).join("&");
    url += `?${params}`;
  }
  return url;
}

export function getExportSummary15mUrl(intersectionId: string, sessionIds?: string[]): string {
  let url = `${API_BASE}/intersections/${intersectionId}/export/summary-15m`;
  if (sessionIds && sessionIds.length > 0) {
    const params = sessionIds.map((id) => `session_ids=${encodeURIComponent(id)}`).join("&");
    url += `?${params}`;
  }
  return url;
}

/**
 * Downloads a file directly using blob trigger to guarantee mobile & desktop browser download.
 */
export async function downloadFile(url: string, defaultFilename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
  
  // Extract filename from header if available
  const disposition = res.headers.get("Content-Disposition");
  let filename = defaultFilename;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  }, 200);
}