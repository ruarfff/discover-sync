import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("sync", "routes/sync.tsx"),
  route("history", "routes/history.tsx"),
  route("auth/spotify/callback", "routes/auth.spotify.callback.tsx"),
  route("api/auth/spotify-url", "routes/api.auth.spotify-url.tsx"),
  route("api/auth/apple-music-save", "routes/api.auth.apple-music-save.tsx"),
  route("api/auth/apple-music-clear", "routes/api.auth.apple-music-clear.tsx"),
  route("api/sync/start", "routes/api.sync.start.tsx"),
  route("api/sync/history", "routes/api.sync.history.tsx"),
  route("api/playlists/spotify", "routes/api.playlists.spotify.tsx"),
] satisfies RouteConfig;
