export interface LinkedPharmacyAccount {
  token: string;
  pharmacy_code: string;
  pharmacy_name: string;
  tenant_id: string;
  is_suspended?: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  slug: string;
  status: string;
  address?: string;
  contact_phone?: string;
  logo_url?: string;
  category?: string;
  is_linked: boolean;
  is_suspended?: boolean;
  linked_pharmacy_id?: string;
  linked_pharmacy_code?: string;
  linked_pharmacy_name?: string;
  pharmacy_token?: string;
  linked_pharmacies?: LinkedPharmacyAccount[];
}

export interface VerifyPharmacyResult {
  success: boolean;
  token?: string;
  pharmacy_id?: string;
  pharmacy_code?: string;
  pharmacy_name?: string;
  tenant_id?: string;
  error?: string;
}
