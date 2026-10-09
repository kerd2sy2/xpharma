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
