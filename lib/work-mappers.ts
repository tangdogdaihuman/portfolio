import { tagsToArray } from "@/lib/db";
import { normalizeMediaUrl } from "@/lib/media-url";
import type { HomeWork, Work, WorkImage } from "@/lib/types";

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

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

export function rowToWork(row: Record<string, unknown>): Work {
  return {
    id: readString(row.id),
    title: readString(row.title),
    description: readString(row.description),
    image_url: normalizeMediaUrl(readString(row.image_url)),
    thumb_url: normalizeMediaUrl(readString(row.thumb_url)),
    tags: tagsToArray(row.tags),
    software: tagsToArray(row.software),
    work_date: readString(row.work_date),
    pinned: readBoolean(row.pinned),
    image_size: readNumber(row.image_size),
    sort_order: readNumber(row.sort_order),
    size_weight: readNumber(row.size_weight, 1),
    created_at: readString(row.created_at),
    updated_at: readString(row.updated_at),
    image_count: row.image_count === undefined ? undefined : readNumber(row.image_count),
    total_size: row.total_size === undefined ? undefined : readNumber(row.total_size),
  };
}

export function rowToHomeWork(row: Record<string, unknown>): HomeWork {
  return {
    id: readString(row.id),
    title: readString(row.title),
    thumb_url: normalizeMediaUrl(readString(row.thumb_url)),
    tags: tagsToArray(row.tags),
    work_date: readString(row.work_date),
    pinned: readBoolean(row.pinned),
    image_count: row.image_count === undefined ? undefined : readNumber(row.image_count),
    size_weight: readNumber(row.size_weight, 1),
  };
}

export function rowToWorkImage(row: Record<string, unknown>): WorkImage {
  return {
    id: readString(row.id),
    work_id: readString(row.work_id),
    image_url: normalizeMediaUrl(readString(row.image_url)),
    thumb_url: normalizeMediaUrl(readString(row.thumb_url)),
    media_type: readString(row.media_type) || "image",
    sort_order: readNumber(row.sort_order),
    image_size: readNumber(row.image_size),
    created_at: readString(row.created_at),
  };
}
