import { z } from "zod";

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 20000;
export const MAX_URL_LENGTH = 600;
export const MAX_WORK_DATE_LENGTH = 40;
export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
export const MAX_TAG_LENGTH = 40;
export const MAX_TAG_COUNT = 30;
export const MAX_TAG_INPUT_LENGTH = 400;
export const MAX_TAG_INPUT_COUNT = 40;

const TAG_SEPARATOR_PATTERN = /[,，]/;

export function normalizeTagList(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const piece of value.split(TAG_SEPARATOR_PATTERN)) {
      const tag = piece.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

export const titleField = z.string().min(1).max(MAX_TITLE_LENGTH);
export const descriptionField = z.string().min(1).max(MAX_DESCRIPTION_LENGTH);
export const urlField = z.string().url().max(MAX_URL_LENGTH);
export const workDateField = z.string().max(MAX_WORK_DATE_LENGTH);
export const fileSizeField = z.number().int().nonnegative().max(MAX_FILE_SIZE_BYTES);
export const sizeWeightField = z.number().min(0.5).max(2);

export const tagListField = z
  .array(z.string().max(MAX_TAG_INPUT_LENGTH))
  .max(MAX_TAG_INPUT_COUNT)
  .transform(normalizeTagList)
  .refine((tags) => tags.length <= MAX_TAG_COUNT, {
    message: `标签数量最多 ${MAX_TAG_COUNT} 个`,
  })
  .refine((tags) => tags.every((tag) => tag.length <= MAX_TAG_LENGTH), {
    message: `单个标签长度最多 ${MAX_TAG_LENGTH} 个字符`,
  });
