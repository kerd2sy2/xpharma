export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  badge_text: string;
  action_type: 'none' | 'url' | 'warehouse' | 'category';
  action_value: string;
  bg_color?: string;
  is_active?: boolean;
  sort_order?: number;
}

const API_BASE_URL = 'https://api.xpharma.cloud';

// Fallback banner when no banners are loaded from the cloud
export const DEFAULT_FALLBACK_BANNER: Banner = {
  id: 'default-hero',
  title: 'منصة إكس فارما السحابية',
  subtitle: 'تصفح مخازن الأدوية والإكسسوارات، وتابع فواتيرك وحساباتك لحظياً بأعلى سرعة وأمان.',
  image_url: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=1200&q=80',
  badge_text: 'تطبيق الصيدليات',
  action_type: 'none',
  action_value: '',
};

export async function fetchBanners(): Promise<Banner[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${API_BASE_URL}/v1/banners`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.banners && Array.isArray(data.banners) && data.banners.length > 0) {
        return data.banners;
      }
    }
  } catch (err) {
    console.log('[BannerService] Falling back to default banners:', err);
  }

  return [DEFAULT_FALLBACK_BANNER];
}
