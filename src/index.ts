import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import dotenv from "dotenv";
import { json } from "body-parser";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { BlueskyService, BlueskyConfig } from "./services/bluesky.service";

// Load environment variables
dotenv.config();

const MAX_FILE_SIZE = 975 * 1024; // ~975KB to be safe
const MAX_IMAGE_DIMENSION = 2000; // Max dimension for width or height

// Extend Express Request with multer types
interface MulterRequest extends Request {
  files: Express.Multer.File[];
}

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB limit initially (we'll resize later)
    files: 4, // Maximum 4 files (Bluesky's limit)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error("Invalid file type. Only JPEG, PNG and GIF are allowed"));
      return;
    }
    cb(null, true);
  },
});

// Create Express app
const app = express();
app.use(json());

// Initialize Bluesky service
const blueskyConfig: BlueskyConfig = {
  service: "https://bsky.social",
  identifier: process.env.BLUESKY_IDENTIFIER || "",
  password: process.env.BLUESKY_PASSWORD || "",
};

const blueskyService = new BlueskyService(blueskyConfig);

// Helper function to process and resize image
async function processImage(
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

// Helper function to clean up files
async function cleanupFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      await fs.promises.unlink(file);
    } catch (err) {
      console.error("Error deleting file:", file, err);
    }
  }
}

// Authentication middleware
const checkCredentials = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!blueskyService.validateConfig()) {
    res.status(500).json({ error: "Bluesky credentials not configured" });
    return;
  }
  next();
};

const ensureAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!blueskyService.getAuthStatus()) {
    try {
      await blueskyService.authenticate();
      if (!blueskyService.getAuthStatus()) {
        res.status(401).json({ error: "Failed to authenticate with Bluesky" });
        return;
      }
    } catch (error) {
      res.status(401).json({ error: "Authentication failed" });
      return;
    }
  }
  next();
};

// Unified post endpoint with proper typing
app.post(
  "/api/post",
  checkCredentials,
  ensureAuthenticated,
  upload.array("images", 4),
  (async (req: Request, res: Response) => {
    const filesToCleanup: string[] = [];
    try {
      const { text, altTexts } = req.body;
      const files = (req as MulterRequest).files || [];

      if (!text) {
        res.status(400).json({ error: "Text content is required" });
        return;
      }

      // Add original files to cleanup list
      files.forEach((file) => filesToCleanup.push(file.path));

      // Parse alt texts
      let parsedAltTexts: string[] = [];
      try {
        parsedAltTexts = altTexts ? JSON.parse(altTexts) : [];
      } catch (e) {
        parsedAltTexts = altTexts ? [altTexts] : [];
      }

      // Base post options
      const postOptions: any = {
        text,
        createdAt: new Date().toISOString(),
      };

      // Process and upload images
      if (files.length > 0) {
        try {
          const processedFiles = await Promise.all(
            files.map(async (file, index) => {
              const processedPath = `${file.path}_processed`;
              filesToCleanup.push(processedPath);
              await processImage(file.path, processedPath, file.mimetype);
              return { path: processedPath, mimetype: file.mimetype };
            }),
          );

          const blobResponses = await Promise.all(
            processedFiles.map((file) =>
              blueskyService.uploadImage(file.path, file.mimetype),
            ),
          );

          postOptions.embed = {
            $type: "app.bsky.embed.images",
            images: blobResponses.map((response, index) => ({
              image: response.data.blob,
              alt: parsedAltTexts[index] || text.substring(0, 300),
            })),
          };
        } catch (error) {
          console.error("Error processing/uploading images:", error);
          await cleanupFiles(filesToCleanup);
          res.status(500).json({ error: "Failed to process or upload images" });
          return;
        }
      }

      // Create the post
      const response = await blueskyService.createPost(postOptions);

      // Clean up all files
      await cleanupFiles(filesToCleanup);

      res.status(201).json({
        message: "Post created successfully",
        uri: response.uri,
        cid: response.cid,
        imageCount: files.length,
      });
    } catch (error) {
      console.error("Error creating post:", error);
      await cleanupFiles(filesToCleanup);
      res.status(500).json({ error: "Failed to create post" });
    }
  }) as express.RequestHandler,
);

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    authenticated: blueskyService.getAuthStatus(),
  });
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  blueskyService.authenticate(); // Initial authentication attempt
});

export default app;
