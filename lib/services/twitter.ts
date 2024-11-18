import got from "got";
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import qs from "querystring";
import fs from "fs";

export interface TwitterConfig {
  consumerKey: string;
  consumerSecret: string;
  // accessToken?: string;
  // accessTokenSecret?: string;
}

export interface TwitterAuthTokens {
  oauth_token: string;
  oauth_token_secret: string;
}

export class TwitterService {
  private config: TwitterConfig;
  private oauth: any;
  private _isAuthenticated: boolean = false;
  private endpointURL = "https://api.twitter.com/2/tweets";

  constructor(config: TwitterConfig) {
    this.config = config;
    this.oauth = new OAuth({
      consumer: {
        key: config.consumerKey,
        secret: config.consumerSecret,
      },
      signature_method: "HMAC-SHA1",
      hash_function: (baseString: string, key: string) =>
        crypto.createHmac("sha1", key).update(baseString).digest("base64"),
    });
  }

  public async authenticate(): Promise<void> {
    try {
      if (this.config.accessToken && this.config.accessTokenSecret) {
        // If we already have access tokens, use them
        this._isAuthenticated = true;
        console.log(
          "Successfully authenticated with Twitter using existing tokens",
        );
        return;
      }

      // Otherwise, need to go through OAuth flow
      const requestToken = await this.requestToken();
      const authorizeURL = new URL("https://api.twitter.com/oauth/authorize");
      authorizeURL.searchParams.append("oauth_token", requestToken.oauth_token);

      console.log(
        "Please visit this URL to authorize the application:",
        authorizeURL.href,
      );
      throw new Error(
        "Manual PIN entry required - please implement PIN handling in your application",
      );
    } catch (error) {
      console.error("Failed to authenticate with Twitter:", error);
      this._isAuthenticated = false;
      throw error;
    }
  }

  private async requestToken(): Promise<TwitterAuthTokens> {
    const requestTokenURL =
      "https://api.twitter.com/oauth/request_token?oauth_callback=oob&x_auth_access_type=write";

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize({
        url: requestTokenURL,
        method: "POST",
      }),
    );

    try {
      const response = await got.post(requestTokenURL, {
        headers: {
          Authorization: authHeader["Authorization"],
        },
      });

      if (response.body) {
        return qs.parse(response.body) as unknown as TwitterAuthTokens;
      }
      throw new Error("Cannot get an OAuth request token");
    } catch (error) {
      console.error("Error getting request token:", error);
      throw error;
    }
  }

  public async createPost(text: string): Promise<any> {
    if (!this._isAuthenticated) {
      throw new Error("Not authenticated with Twitter");
    }

    const token = {
      key: this.config.accessToken!,
      secret: this.config.accessTokenSecret!,
    };

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(
        {
          url: this.endpointURL,
          method: "POST",
        },
        token,
      ),
    );

    try {
      const response = await got.post(this.endpointURL, {
        json: { text },
        responseType: "json",
        headers: {
          Authorization: authHeader["Authorization"],
          "user-agent": "v2CreateTweetJS",
          "content-type": "application/json",
          accept: "application/json",
        },
      });

      return response.body;
    } catch (error) {
      console.error("Error creating tweet:", error);
      throw error;
    }
  }

  public async uploadMedia(filePath: string): Promise<string> {
    if (!this._isAuthenticated) {
      throw new Error("Not authenticated with Twitter");
    }

    const uploadURL = "https://upload.twitter.com/1.1/media/upload.json";
    const mediaData = await fs.promises.readFile(filePath);
    const base64Data = mediaData.toString("base64");

    const token = {
      key: this.config.accessToken!,
      secret: this.config.accessTokenSecret!,
    };

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(
        {
          url: uploadURL,
          method: "POST",
        },
        token,
      ),
    );

    try {
      const response = await got
        .post(uploadURL, {
          form: {
            media_data: base64Data,
          },
          headers: {
            Authorization: authHeader["Authorization"],
          },
        })
        .json();

      return (response as any).media_id_string;
    } catch (error) {
      console.error("Error uploading media:", error);
      throw error;
    }
  }

  public getAuthStatus(): boolean {
    return this._isAuthenticated;
  }

  public validateConfig(): boolean {
    return !!(
      this.config.consumerKey &&
      this.config.consumerSecret &&
      (this._isAuthenticated ||
        (this.config.accessToken && this.config.accessTokenSecret))
    );
  }
}
