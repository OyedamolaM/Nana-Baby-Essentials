export interface StoreLocationRecord {
  address: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  created_at?: string;
  description?: string | null;
  hero_image?: string | null;
  id: string;
  is_active: boolean;
  name: string;
  opening_hours?: string | null;
  slug: string;
  sort_order: number;
  updated_at?: string;
  whatsapp_phone?: string | null;
}

export function splitLocationOpeningHours(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
