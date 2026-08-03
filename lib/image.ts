import sharp from "sharp";

export async function generateThumbnail(
  buffer: Buffer,
  width = 1600
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, undefined, { withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}
