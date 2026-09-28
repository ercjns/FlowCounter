export interface Approach {
  id: string;
  intersection_id: string;
  name: string;
  compass_degrees: number;
  type: "entry" | "exit";
}

export interface Movement {
  id: string;
  intersection_id: string;
  name: string;
  entry_approach_id: string;
  exit_approach_id: string;
  movement_type?: string;
  valid_mode_ids: string[];
}

export interface TravelMode {
  id: string;
  intersection_id: string;
  name: string;
  color?: string;
  sort_order?: number;
}

export interface IntersectionSummary {
  id: string;
  name: string;
  description?: string;
  has_password: boolean;
  created_at: string;
}

export interface IntersectionDetail extends IntersectionSummary {
  approaches: Approach[];
  movements: Movement[];
  modes: TravelMode[];
}

export interface SessionData {
  id: string;
  intersection_id: string;
  counter_name: string;
  started_at: string | null;
  ended_at?: string | null;
  assigned_modes: string[];
  assigned_movements: string[];
  movement_modes?: Record<string, string[]> | null;
  notes?: string | null;
}

export interface SessionStats {
  session_id: string;
  totals: Record<string, number>; // key: "movement_id:mode_id"
  bucket_15m_totals: Record<string, number>;
  current_bucket_str: string;
}
