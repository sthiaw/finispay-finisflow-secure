export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
};
export type DashboardRecord = {
  id: string;
  user_id: string;
  data_type: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type InventoryData = {
  name: string;
  sku: string;
  batch: string;
  location: string;
  quantity: number;
  unitPrice: number;
  manufacturedAt: string;
  expiryDate: string;
  category?: string;
  actionStatus?: string;
};

export type PaymentData = {
  title: string;
  counterparty: string;
  amount: number;
  direction: "sent" | "received";
  reference: string;
  note?: string;
};

export type WalletData = { balance: number };

