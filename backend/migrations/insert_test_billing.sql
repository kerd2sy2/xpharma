-- Insert test pharmacy
INSERT INTO public.pharmacies (tenant_id, code, name, phone, link_code)
VALUES (
  '70bf6165-e2fc-4c3a-b959-aa4651b836f0',
  '101',
  'صيدلية الأمل الحديثة',
  '01012345678',
  'LNK-7788'
)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Insert pending subscription for review
INSERT INTO public.subscriptions (
  tenant_id,
  pharmacy_id,
  plan_type,
  status,
  start_date,
  end_date,
  receipt_url,
  receipt_ref,
  notes
)
SELECT 
  p.tenant_id,
  p.id,
  'monthly',
  'pending_approval',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80',
  'INSTA-TRX-9988231',
  'تم التحويل عبر إنستاباي - يرجى التفعيل'
FROM public.pharmacies p
WHERE p.code = '101'
LIMIT 1;
