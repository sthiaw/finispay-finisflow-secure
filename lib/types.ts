export type Profile = { id: string; full_name: string; email: string; phone: string | null; created_at: string; updated_at: string };
export type DashboardRecord = { id: string; user_id: string; data_type: string; data: Record<string, unknown>; created_at: string; updated_at: string };
