// Helper function to process and resize image

import sharp from "sharp";

const MAX_FILE_SIZE = 975 * 1024; // ~975KB for Bluesky's limit
const MAX_IMAGE_DIMENSION = 2000;

export async function processImage(
  inputPath: string,
  outputPath: string,
  mimeType: string,
): Promise<void> {
  let image = sharp(inputPath);
  const metadata = await image.metadata();

  // Resize if dimensions are too large
  if (metadata.width && metadata.height) {
    const maxDim = Math.max(metadata.width, metadata.height);
    if (maxDim > MAX_IMAGE_DIMENSION) {
      const ratio = MAX_IMAGE_DIMENSION / maxDim;
      image = image.resize(
        Math.round(metadata.width * ratio),
        Math.round(metadata.height * ratio),
        {
          fit: "inside",
          withoutEnlargement: true,
        },
      );
    }
  }

  // Set quality based on mime type
  if (mimeType === "image/jpeg") {
    image = image.jpeg({ quality: 80 });
  } else if (mimeType === "image/png") {
    image = image.png({ quality: 80 });
  }

  await image.toFile(outputPath);

  // Check if file is still too large
  const stats = await fs.promises.stat(outputPath);
  if (stats.size > MAX_FILE_SIZE) {
    // If still too large, reduce quality further
    image = sharp(outputPath);
    if (mimeType === "image/jpeg" || mimeType === "image/png") {
      const quality = Math.floor((MAX_FILE_SIZE / stats.size) * 70);
      if (mimeType === "image/jpeg") {
        image = image.jpeg({ quality });
      } else {
        image = image.png({ quality });
      }
      await image.toFile(outputPath);
    }
  }
}
