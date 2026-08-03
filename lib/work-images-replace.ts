import type { Transaction } from "@libsql/client";

export interface PreparedWorkImage {
  id: string;
  imageUrl: string;
  thumbUrl: string;
  mediaType: string;
  imageSize: number;
  sortOrder: number;
}

export interface CoverImage {
  image_url?: unknown;
  thumb_url?: unknown;
}

export function collectRemovedImageUrls(
  existingRows: Array<Record<string, unknown>>,
  nextImages: PreparedWorkImage[],
  currentCover?: CoverImage
): string[] {
  const newUrls = new Set(nextImages.flatMap((image) => [image.imageUrl, image.thumbUrl]));
  const previousUrls = new Set<string>();
  const addPreviousUrl = (value: unknown) => {
    if (typeof value === "string" && value) previousUrls.add(value);
  };

  for (const row of existingRows) {
    addPreviousUrl(row.image_url);
    addPreviousUrl(row.thumb_url);
  }
  addPreviousUrl(currentCover?.image_url);
  addPreviousUrl(currentCover?.thumb_url);

  return [...previousUrls].filter((url) => !newUrls.has(url));
}

export function chooseCoverImage(nextImages: PreparedWorkImage[], currentCover?: CoverImage): PreparedWorkImage {
  return (
    nextImages.find((image) => image.imageUrl === currentCover?.image_url) ||
    nextImages.find((image) => image.thumbUrl === currentCover?.thumb_url) ||
    [...nextImages].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  );
}

export async function replaceWorkImagesInTransaction(
  transaction: Pick<Transaction, "execute" | "batch">,
  workId: string,
  images: PreparedWorkImage[]
) {
  await transaction.execute({ sql: "DELETE FROM work_images WHERE work_id = ?", args: [workId] });
  if (images.length === 0) return;

  await transaction.batch(
    images.map((image) => ({
      sql: `INSERT INTO work_images (id, work_id, image_url, thumb_url, media_type, sort_order, image_size)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [image.id, workId, image.imageUrl, image.thumbUrl, image.mediaType, image.sortOrder, image.imageSize],
    }))
  );
}
