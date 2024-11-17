import { BskyAgent } from "@atproto/api";
import fs from "fs";

export interface BlueskyConfig {
  service: string;
  identifier: string;
  password: string;
}

export class BlueskyService {
  private agent: BskyAgent;
  private _isAuthenticated: boolean = false;
  private config: BlueskyConfig;

  constructor(config: BlueskyConfig) {
    this.config = config;
    this.agent = new BskyAgent({ service: config.service });
  }

  public async authenticate(): Promise<void> {
    try {
      await this.agent.login({
        identifier: this.config.identifier,
        password: this.config.password,
      });
      this._isAuthenticated = true;
      console.log("Successfully authenticated with Bluesky");
    } catch (error) {
      console.error("Failed to authenticate with Bluesky:", error);
      this._isAuthenticated = false;
      throw error;
    }
  }

  public getAuthStatus(): boolean {
    return this._isAuthenticated;
  }

  public async uploadImage(filePath: string, mimeType: string) {
    const imageData = await fs.promises.readFile(filePath);
    const response = await this.agent.uploadBlob(imageData, {
      encoding: mimeType,
    });
    return response;
  }

  public async createPost(postOptions: any) {
    if (!this._isAuthenticated) {
      throw new Error("Not authenticated with Bluesky");
    }
    return await this.agent.post(postOptions);
  }

  public validateConfig(): boolean {
    return !!(this.config.identifier && this.config.password);
  }
}
