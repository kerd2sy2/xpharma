import {
  InvoiceItem,
  InvoiceLineItem,
  LinkedPharmacyAccount,
  PharmacyBalance,
  ReceiptItem,
  ReturnItem,
  StatementItem,
  Warehouse,
} from '@/services/warehouse';
import { SubscriptionStatus } from '@/services/subscription';

export type SectionKey = 'purchases' | 'returns' | 'receipts' | 'statement';

export interface PortalSectionConfig {
  key: SectionKey;
  title: string;
  desc: string;
  amount?: number;
  count?: number;
  icon: any;
  color: string;
  bgColor: string;
}

export interface PortalColors {
  bg: string;
  card: string;
  cardBack: string;
  cardBack2: string;
  text: string;
  secondaryText: string;
  border: string;
  borderLayer2: string;
  borderLayer3: string;
  primary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  indigo: string;
  indigoSoft: string;
}

export const defaultPortalColors: PortalColors = {
  bg: '#F9F7FD',
  card: '#FFFFFF',
  cardBack: '#F4EFFC',
  cardBack2: '#E7DCF8',
  text: '#1A0A33',
  secondaryText: '#7B6F93',
  border: '#EDE7F6',
  borderLayer2: '#CBB5EB',
  borderLayer3: '#B69CE3',
  primary: '#3f0082',
  primarySoft: '#3f008212',
  success: '#00B86B',
  successSoft: '#00B86B14',
  warning: '#D97706',
  warningSoft: '#D9770614',
  indigo: '#4F46E5',
  indigoSoft: '#4F46E514',
};

export const formatCurrency = (amount?: number) => {
  const val = amount ?? 0;
  return `${val.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
};

export const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};
