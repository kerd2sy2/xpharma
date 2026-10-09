export interface InvoiceItem {
  id: string;
  invoice_number: string;
  remote_id: string;
  invoice_date: string;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
}

export interface InvoiceLineItem {
  id: string;
  remote_item_id?: string;
  item_code?: string;
  item_name: string;
  unit?: string;
  quantity: number;
  bonus_quantity?: number;
  unit_price: number;
  discount_percent: number;
  total_price: number;
}
