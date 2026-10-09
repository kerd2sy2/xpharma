export interface ReceiptItem {
  id: string;
  receipt_number?: string;
  remote_id?: string;
  receipt_date?: string;
  amount?: number;
  payment_method?: string;
  notes?: string;
}
