import { resilientFetch } from '@/utils/resilientFetch';
import { Banner } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

export const DEFAULT_FALLBACK_BANNER: Banner = {
  id: 'default-hero',
  title: 'منصة إكس فارما السحابية',
  subtitle: 'تصفح مخازن الأدوية والإكسسوارات، وتابع فواتيرك وحساباتك لحظياً بأعلى سرعة وأمان.',
  image_url: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=1200&q=80',
  badge_text: 'تطبيق الصيدليات',
  action_type: 'none',
  action_value: '',
};

export function formatBannerImageUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `https://admin.xpharma.cloud${cleanPath}`;
}

export async function fetchBanners(): Promise<Banner[]> {
  try {
    const data = await resilientFetch<{ banners?: Banner[] }>(`${API_BASE_URL}/v1/banners`, {
      timeoutMs: 5000,
      retries: 2,
      fallback: { banners: [DEFAULT_FALLBACK_BANNER] },
      serviceName: 'banners-api',
      headers: { Accept: 'application/json' },
    });

    if (data?.banners && Array.isArray(data.banners) && data.banners.length > 0) {
      return data.banners.map((b) => ({
        ...b,
        image_url: formatBannerImageUrl(b.image_url),
      }));
    }
  } catch (err) {
    console.warn('[BannerService] Graceful degradation to default banner:', err);
  }

  return [DEFAULT_FALLBACK_BANNER];
}
