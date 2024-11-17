export interface AppConfig {
  port: number;
  uploads: {
    maxFileSize: number;
    maxImageDimension: number;
  };
  threads: {
    csrfToken: string;
    sessionId: string;
    dsUserId: string;
    igAppId: string;
  };
  bluesky: {
    service: string;
    identifier: string;
    password: string;
  };
}
