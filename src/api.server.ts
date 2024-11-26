import express, { Request, Response } from "express";
import multer from "multer";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { BlueskyService } from "../lib/services/bluesky.ts";
import { PreviewServer, type ViteDevServer } from "vite";
import { processImage, cleanupFiles } from "../lib/utils.ts"

const { json } = bodyParser;

// Load environment variables
dotenv.config();

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

const blueskyService = new BlueskyService({
  service: "https://bsky.social",
  identifier: process.env.BLUESKY_IDENTIFIER || "",
  password: process.env.BLUESKY_PASSWORD || "",
});

// Unified post endpoint with proper typing
app.post("/api/post",
  blueskyService.ensureAuthenticated,
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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

export default () => ({
  name: 'api',
  configureServer(server: ViteDevServer) {
    // @ts-expect-error
    server.middlewares.use((req, res, next) => app(req,res,next))
  },
  configurePreviewServer(server: PreviewServer) {
    // @ts-expect-error
    server.middlewares.use((req, res, next) => app(req,res,next))
  }
})
