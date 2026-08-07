export interface Work {
  id: string;
  title: string;
  description: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  software: string[];
  work_date: string;
  pinned: boolean;
  image_size: number;
  sort_order: number;
  size_weight: number;
  created_at: string;
  updated_at: string;
  image_count?: number;
  total_size?: number;
}

export interface WorkImage {
  id: string;
  work_id: string;
  image_url: string;
  thumb_url: string;
  media_type: string;
  sort_order: number;
  image_size: number;
  created_at: string;
}

export interface Section {
  id: string;
  title: string;
  content: string;
}

export interface VisitDailyPoint {
  date: string;
  visits: number;
  visitors: number;
}

export interface VisitTopPage {
  path: string;
  title: string;
  visits: number;
}

export interface VisitRecord {
  id: string;
  path: string;
  referrer: string;
  userAgent: string;
  createdAt: string;
}

export interface VisitStats {
  totalVisits: number;
  uniqueVisitors: number;
  todayVisits: number;
  todayVisitors: number;
  weekVisits: number;
  daily: VisitDailyPoint[];
  topPages: VisitTopPage[];
  recent: VisitRecord[];
}
