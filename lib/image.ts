import sharp from "sharp";

export async function generateThumbnail(
  buffer: Buffer,
  width = 800
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, undefined, { withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}
