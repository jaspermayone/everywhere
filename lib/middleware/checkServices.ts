// Authentication middleware

import { Request, Response, NextFunction } from "express";
import { BlueskyService } from "../services/bluesky";
import { TwitterService } from "../services/twitter";

export const checkServices = async (
  req: Request,
  res: Response,
  next: NextFunction,
  blueskyService: BlueskyService,
  twitterService: TwitterService,
): Promise<void> => {
  const services = ((req.query.services as string) || "bluesky,twitter")
    .toLowerCase()
    .split(",");
  const errors = [];

  if (services.includes("bluesky") && !blueskyService.validateConfig()) {
    errors.push("Bluesky credentials not configured");
  }

  if (services.includes("twitter") && !twitterService.validateConfig()) {
    errors.push("Twitter credentials not configured");
  }

  if (errors.length > 0) {
    res.status(500).json({ errors });
    return;
  }

  try {
    const authPromises = [];
    if (services.includes("bluesky") && !blueskyService.getAuthStatus()) {
      authPromises.push(blueskyService.authenticate());
    }
    if (services.includes("twitter") && !twitterService.getAuthStatus()) {
      authPromises.push(twitterService.authenticate());
    }

    await Promise.all(authPromises);
    next();
  } catch (error) {
    res.status(401).json({ error: "Authentication failed" });
  }
};
