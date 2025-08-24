declare global {
  interface Window {
    MusicKit: {
      configure(config: {
        developerToken: string;
        app: {
          name: string;
          build: string;
        };
      }): Promise<void>;
      getInstance(): {
        authorize(): Promise<string>;
        unauthorize(): Promise<void>;
        isAuthorized: boolean;
        api: {
          search(query: string, options?: { types: string[], limit?: number }): Promise<any>;
          songs(options?: { filter?: { isrc?: string } }): Promise<any>;
          library: {
            playlists: {
              create(data: { attributes: { name: string; description?: string } }): Promise<any>;
            };
          };
        };
      };
    };
    __APPLE_DEVELOPER_TOKEN__?: string;
  }
}

export {};