import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "../test/setup";
import { SessionSetup } from "../components/SessionSetup";
import { CountingField } from "../components/CountingField";
import type { IntersectionDetail, SessionData } from "../types";
import * as api from "../api";

// Mock API calls
vi.mock("../api", () => ({
  openSession: vi.fn(),
  startSession: vi.fn(), // alias
  beginCounting: vi.fn().mockResolvedValue({
    id: "s1",
    intersection_id: "int-1",
    counter_name: "Alice Observer",
    started_at: "2026-09-17T12:00:00Z",
    ended_at: null,
    assigned_modes: ["m1", "m2"],
    assigned_movements: ["mov1"],
    movement_modes: { mov1: ["m1", "m2"] },
  }),
  recordTalliesBatch: vi.fn().mockResolvedValue([]),
  undoLastTally: vi.fn().mockResolvedValue({ deleted: {} }),
  fetchSessionStats: vi.fn().mockResolvedValue({
    session_id: "s1",
    totals: {},
    bucket_15m_totals: {},
    current_bucket_str: "2026-09-17 12:00 UTC",
  }),
  endSession: vi.fn().mockResolvedValue({
    id: "s1",
    intersection_id: "int-1",
    counter_name: "Test Observer",
    started_at: "2026-09-17T12:00:00Z",
    ended_at: "2026-09-17T12:30:00Z",
    assigned_modes: ["m1"],
    assigned_movements: ["mov1"],
    movement_modes: { mov1: ["m1"] },
  }),
  getExportRawUrl: vi.fn().mockReturnValue("/api/intersections/int-1/export/raw"),
  getExportSummary15mUrl: vi.fn().mockReturnValue("/api/intersections/int-1/export/summary-15m"),
  downloadFile: vi.fn().mockResolvedValue(undefined),
}));

const mockIntersection: IntersectionDetail = {
  id: "int-1",
  name: "Broadway & 5th Ave",
  description: "Test intersection",
  has_password: false,
  created_at: "2026-09-17T10:00:00Z",
  approaches: [
    { id: "app1", intersection_id: "int-1", name: "Northbound Entry", compass_degrees: 0, type: "entry" },
    { id: "app2", intersection_id: "int-1", name: "Southbound Exit", compass_degrees: 180, type: "exit" },
  ],
  movements: [
    {
      id: "mov1",
      intersection_id: "int-1",
      name: "NB Thru",
      entry_approach_id: "app1",
      exit_approach_id: "app2",
      movement_type: "thru",
      valid_mode_ids: ["m1", "m2"],
    },
    {
      id: "mov2",
      intersection_id: "int-1",
      name: "SB Thru",
      entry_approach_id: "app2",
      exit_approach_id: "app1",
      movement_type: "thru",
      valid_mode_ids: ["m1"],
    },
  ],
  modes: [
    { id: "m1", intersection_id: "int-1", name: "Car", color: "#0d6efd", sort_order: 1 },
    { id: "m2", intersection_id: "int-1", name: "Pedestrian", color: "#198754", sort_order: 2 },
  ],
};

// Session has started_at = null (not yet started counting)
const mockSessionNotStarted: SessionData = {
  id: "s1",
  intersection_id: "int-1",
  counter_name: "Alice Observer",
  started_at: null,
  assigned_modes: ["m1", "m2"],
  assigned_movements: ["mov1"],
  movement_modes: { mov1: ["m1", "m2"] },
};

// Session has started_at set (already counting)
const mockSessionStarted: SessionData = {
  id: "s1",
  intersection_id: "int-1",
  counter_name: "Alice Observer",
  started_at: "2026-09-17T12:00:00Z",
  assigned_modes: ["m1", "m2"],
  assigned_movements: ["mov1"],
  movement_modes: { mov1: ["m1", "m2"] },
};

describe("FlowCounter Frontend Component Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders movements with per-movement mode toggles in SessionSetup and allows opening a session", async () => {
    const handleStart = vi.fn();
    const handleBack = vi.fn();

    render(
      <SessionSetup
        intersection={mockIntersection}
        onBack={handleBack}
        onSessionStarted={handleStart}
      />
    );

    expect(screen.getByText("Broadway & 5th Ave")).toBeTruthy();
    expect(screen.getByText("NB Thru")).toBeTruthy();
    expect(screen.getByText("SB Thru")).toBeTruthy();

    const nameInput = screen.getByLabelText(/Your Name \/ Counter ID/i);
    fireEvent.change(nameInput, { target: { value: "Bob Smith" } });

    (api.openSession as any).mockResolvedValueOnce({ id: "session-xyz" });

    const openBtn = screen.getByRole("button", { name: /Open Counting Session/i });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(api.openSession).toHaveBeenCalledWith(
        "int-1",
        expect.objectContaining({
          counter_name: "Bob Smith",
          movement_modes: expect.any(Object),
        })
      );
      expect(handleStart).toHaveBeenCalledWith("session-xyz");
    });
  });

  it("triggers CSV downloads when clicking Export Data in SessionSetup", async () => {
    const handleStart = vi.fn();
    const handleBack = vi.fn();

    render(
      <SessionSetup
        intersection={mockIntersection}
        onBack={handleBack}
        onSessionStarted={handleStart}
      />
    );

    const exportDataBtn = screen.getByRole("button", { name: /Export Data/i });
    fireEvent.click(exportDataBtn);

    expect(screen.getByText(/Raw Tally Events \(CSV\)/i)).toBeTruthy();
    expect(screen.getByText(/15-Minute Summary Matrix \(CSV\)/i)).toBeTruthy();

    const rawBtn = screen.getByText(/Raw Tally Events \(CSV\)/i).closest("button")!;
    fireEvent.click(rawBtn);

    await waitFor(() => {
      expect(api.downloadFile).toHaveBeenCalledWith(
        "/api/intersections/int-1/export/raw",
        "traffic_raw_Broadway_&_5th_Ave.csv"
      );
    });

    const summaryBtn = screen.getByText(/15-Minute Summary Matrix \(CSV\)/i).closest("button")!;
    fireEvent.click(summaryBtn);

    await waitFor(() => {
      expect(api.downloadFile).toHaveBeenCalledWith(
        "/api/intersections/int-1/export/summary-15m",
        "traffic_15min_summary_Broadway_&_5th_Ave.csv"
      );
    });
  });

  it("shows 'Start Counting' button and disabled tally buttons when session not yet started", async () => {
    const handleEnd = vi.fn();

    render(
      <CountingField
        intersection={mockIntersection}
        session={mockSessionNotStarted}
        onEndSession={handleEnd}
      />
    );

    // Start Counting button should be visible
    const startBtn = screen.getByRole("button", { name: /Start Counting/i });
    expect(startBtn).toBeTruthy();

    // Tally buttons should be disabled
    const carBtns = screen.getAllByRole("button", { name: /Car/i });
    expect(carBtns[0].hasAttribute("disabled")).toBe(true);

    // Info banner should be visible — text is split across elements so look for partial text
    expect(screen.getByText(/when you are ready to begin/i)).toBeTruthy();
  });

  it("enables tally buttons after clicking 'Start Counting', which calls beginCounting", async () => {
    const handleEnd = vi.fn();

    render(
      <CountingField
        intersection={mockIntersection}
        session={mockSessionNotStarted}
        onEndSession={handleEnd}
      />
    );

    const startBtn = screen.getByRole("button", { name: /Start Counting/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(api.beginCounting).toHaveBeenCalledWith("s1");
    });

    await waitFor(() => {
      // After counting starts, "Stop Counting" button should appear
      expect(screen.getByRole("button", { name: /Stop Counting/i })).toBeTruthy();
    });
  });

  it("renders correct tally buttons for movement's modes when session is already started, records clicks", async () => {
    const handleEnd = vi.fn();

    render(
      <CountingField
        intersection={mockIntersection}
        session={mockSessionStarted}
        onEndSession={handleEnd}
      />
    );

    expect(screen.getByText("NB Thru")).toBeTruthy();

    // Should show Stop Counting button (already started)
    expect(screen.getByRole("button", { name: /Stop Counting/i })).toBeTruthy();

    const carBtns = screen.getAllByRole("button", { name: /Car/i });
    const carBtn = carBtns[0];
    expect(carBtn).toBeTruthy();
    expect(carBtn.hasAttribute("disabled")).toBe(false);

    expect(carBtn.textContent).toContain("0");

    fireEvent.click(carBtn);
    fireEvent.click(carBtn);
    fireEvent.click(carBtn);

    expect(carBtn.textContent).toContain("3");
    expect(carBtn.textContent).toContain("15m: 3");
  });

  it("undo button properly removes the last tally event and decrements counter", async () => {
    const handleEnd = vi.fn();

    render(
      <CountingField
        intersection={mockIntersection}
        session={mockSessionStarted}
        onEndSession={handleEnd}
      />
    );

    const carBtns = screen.getAllByRole("button", { name: /Car/i });
    const carBtn = carBtns[0];
    const undoBtn = screen.getByRole("button", { name: /Undo/i }) as HTMLButtonElement;

    expect(undoBtn.disabled).toBe(true);

    fireEvent.click(carBtn);
    fireEvent.click(carBtn);
    expect(carBtn.textContent).toContain("2");
    expect(undoBtn.disabled).toBe(false);

    fireEvent.click(undoBtn);
    expect(carBtn.textContent).toContain("1");

    fireEvent.click(undoBtn);
    expect(carBtn.textContent).toContain("0");
    expect(undoBtn.disabled).toBe(true);
  });

  it("allows downloading exports directly from the completed session screen after ending count", async () => {
    const handleEnd = vi.fn();

    render(
      <CountingField
        intersection={mockIntersection}
        session={mockSessionStarted}
        onEndSession={handleEnd}
      />
    );

    const endSessionBtn = screen.getByRole("button", { name: /Stop Counting/i });
    fireEvent.click(endSessionBtn);

    const confirmBtn = screen.getByRole("button", { name: /Confirm & End/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Counting Session Completed/i)).toBeTruthy();
    });

    const rawExportBtn = screen.getByRole("button", { name: /Export Raw Events \(CSV\)/i });
    fireEvent.click(rawExportBtn);

    await waitFor(() => {
      expect(api.downloadFile).toHaveBeenCalledWith(
        "/api/intersections/int-1/export/raw",
        "traffic_raw_Broadway_&_5th_Ave.csv"
      );
    });

    const summaryExportBtn = screen.getByRole("button", { name: /Export 15-Minute Summary Matrix \(CSV\)/i });
    fireEvent.click(summaryExportBtn);

    await waitFor(() => {
      expect(api.downloadFile).toHaveBeenCalledWith(
        "/api/intersections/int-1/export/summary-15m",
        "traffic_15min_summary_Broadway_&_5th_Ave.csv"
      );
    });
  });
});