export interface Work {
  id: string;
  title: string;
  description: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  work_date: string;
  pinned: boolean;
  image_size: number;
  sort_order: number;
  crop_x: number;
  crop_y: number;
  created_at: string;
  image_count?: number;
}

export interface WorkImage {
  id: string;
  work_id: string;
  image_url: string;
  thumb_url: string;
  sort_order: number;
  image_size: number;
  crop_x: number;
  crop_y: number;
  created_at: string;
}

export interface Section {
  id: string;
  title: string;
  content: string;
}
