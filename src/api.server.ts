import bodyParser from "body-parser";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { PreviewServer, type ViteDevServer } from "vite";
import { BlueskyConfig, BlueskyService } from "../lib/services/bluesky.ts";
import { TwitterConfig, TwitterService } from "../lib/services/twitter.ts";
import { cleanupFiles } from "../lib/common/cleanupFiles.ts";
import { checkServices } from "../lib/middleware/checkServices.ts";
import { processImage } from "../lib/common/processImage.ts";

const { json } = bodyParser;

// Load environment variables
dotenv.config();

const TWITTER_MAX_FILES = 4;
const BLUESKY_MAX_FILES = 4;

interface MulterRequest extends Request {
  files: Express.Multer.File[];
}

interface PostResponse {
  platform: string;
  success: boolean;
  error?: string;
  data?: any;
}

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB limit initially (we'll resize later)
    files: Math.max(TWITTER_MAX_FILES, BLUESKY_MAX_FILES),
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

// Initialize services
const blueskyConfig: BlueskyConfig = {
  service: "https://bsky.social",
  identifier: process.env.BLUESKY_IDENTIFIER || "",
  password: process.env.BLUESKY_PASSWORD || "",
};

const twitterConfig: TwitterConfig = {
  consumerKey: process.env.TWITTER_API_KEY!,
  consumerSecret: process.env.TWITTER_KEY_SECRET!,
};

const blueskyService = new BlueskyService(blueskyConfig);
const twitterService = new TwitterService(twitterConfig);

// Unified post endpoint with proper typing
app.post(
  "/api/post",
  (req: Request, res: Response, next: NextFunction) =>
    checkServices(req, res, next, blueskyService, twitterService),
  upload.array("images", Math.max(TWITTER_MAX_FILES, BLUESKY_MAX_FILES)),
  (async (req: Request, res: Response) => {
    const filesToCleanup: string[] = [];
    try {
      const { text, altTexts } = req.body;
      const files = (req as MulterRequest).files || [];
      const services = ((req.query.services as string) || "bluesky,twitter")
        .toLowerCase()
        .split(",");

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

      const responses: PostResponse[] = [];

      // Process files once for both services
      const processedFiles = await Promise.all(
        files.map(async (file) => {
          const processedPath = `${file.path}_processed`;
          filesToCleanup.push(processedPath);
          await processImage(file.path, processedPath, file.mimetype);
          return { path: processedPath, mimetype: file.mimetype };
        }),
      );

      // Post to Bluesky if requested
      if (services.includes("bluesky")) {
        try {
          const blueskyFiles = processedFiles.slice(0, BLUESKY_MAX_FILES);
          const blobResponses = await Promise.all(
            blueskyFiles.map((file) =>
              blueskyService.uploadImage(file.path, file.mimetype),
            ),
          );

          const postOptions = {
            text,
            createdAt: new Date().toISOString(),
            embed:
              blueskyFiles.length > 0
                ? {
                    $type: "app.bsky.embed.images",
                    images: blobResponses.map((response, index) => ({
                      image: response.data.blob,
                      alt: parsedAltTexts[index] || text.substring(0, 300),
                    })),
                  }
                : undefined,
          };

          const response = await blueskyService.createPost(postOptions);
          responses.push({
            platform: "bluesky",
            success: true,
            data: { uri: response.uri, cid: response.cid },
          });
        } catch (error) {
          console.error("Bluesky post error:", error);
          responses.push({
            platform: "bluesky",
            success: false,
            error: error.message,
          });
        }
      }

      // Post to Twitter if requested
      if (services.includes("twitter")) {
        try {
          const twitterFiles = processedFiles.slice(0, TWITTER_MAX_FILES);
          let mediaIds: string[] = [];

          if (twitterFiles.length > 0) {
            mediaIds = await Promise.all(
              twitterFiles.map((file) => twitterService.uploadMedia(file.path)),
            );
          }

          const tweetResponse = await twitterService.createPost(text, mediaIds);
          responses.push({
            platform: "twitter",
            success: true,
            data: tweetResponse,
          });
        } catch (error) {
          console.error("Twitter post error:", error);
          responses.push({
            platform: "twitter",
            success: false,
            error: error.message,
          });
        }
      }

      // Clean up all files
      await cleanupFiles(filesToCleanup);

      // If all posts failed, return 500
      if (responses.every((r) => !r.success)) {
        res.status(500).json({
          error: "All posts failed",
          details: responses,
        });
        return;
      }

      res.status(201).json({
        message: "Posts created",
        responses,
        imageCount: files.length,
      });
    } catch (error) {
      console.error("Error creating posts:", error);
      await cleanupFiles(filesToCleanup);
      res.status(500).json({ error: "Failed to create posts" });
    }
  }) as express.RequestHandler,
);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

export default () => ({
  name: "api",
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req, res, next) => app(req, res, next));
  },
  configurePreviewServer(server: PreviewServer) {
    server.middlewares.use((req, res, next) => app(req, res, next));
  },
});
