import { tagsToArray } from "@/lib/db";
import type { Work, WorkImage } from "@/lib/types";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function rowToWork(row: Record<string, unknown>): Work {
  return {
    id: readString(row.id),
    title: readString(row.title),
    description: readString(row.description),
    image_url: readString(row.image_url),
    thumb_url: readString(row.thumb_url),
    tags: tagsToArray(row.tags),
    software: tagsToArray(row.software),
    work_date: readString(row.work_date),
    pinned: Boolean(row.pinned),
    image_size: readNumber(row.image_size),
    sort_order: readNumber(row.sort_order),
    size_weight: readNumber(row.size_weight, 1),
    created_at: readString(row.created_at),
    updated_at: readString(row.updated_at),
    image_count: row.image_count === undefined ? undefined : readNumber(row.image_count),
    total_size: row.total_size === undefined ? undefined : readNumber(row.total_size),
  };
}

export function rowToWorkImage(row: Record<string, unknown>): WorkImage {
  return {
    id: readString(row.id),
    work_id: readString(row.work_id),
    image_url: readString(row.image_url),
    thumb_url: readString(row.thumb_url),
    media_type: readString(row.media_type) || "image",
    sort_order: readNumber(row.sort_order),
    image_size: readNumber(row.image_size),
    created_at: readString(row.created_at),
  };
}
