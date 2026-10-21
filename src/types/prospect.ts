export type ProspectStatus =
  | "new"
  | "contacted"
  | "follow_up"
  | "qualified"
  | "closed"
  | "not_relevant";

export interface Prospect {
  id: string;
  userId: string;
  mmsi: string;
  vesselName: string;
  vesselType: string | null;
  destination: string | null;
  company: string;
  status: ProspectStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ProspectRow = {
  id: string;
  user_id: string;
  mmsi: string;
  vessel_name: string;
  vessel_type: string | null;
  destination: string | null;
  company: string | null;
  status: ProspectStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ProspectInsert = {
  user_id: string;
  mmsi: string;
  vessel_name: string;
  vessel_type: string | null;
  destination: string | null;
  company?: string | null;
  status?: ProspectStatus;
  notes?: string;
};

export type ProspectUpdate = {
  vessel_name?: string;
  vessel_type?: string | null;
  destination?: string | null;
  company?: string | null;
  status?: ProspectStatus;
  notes?: string;
};

export interface Database {
  public: {
    Tables: {
      prospects: {
        Row: ProspectRow;
        Insert: ProspectInsert;
        Update: ProspectUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

export function toProspect(row: ProspectRow): Prospect {
  return {
    id: row.id,
    userId: row.user_id,
    mmsi: row.mmsi,
    vesselName: row.vessel_name,
    vesselType: row.vessel_type,
    destination: row.destination,
    company: row.company ?? "",
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
