import sharp from "sharp";

export async function generateThumbnail(
  buffer: Buffer,
  width = 1080
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, undefined, { withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}
