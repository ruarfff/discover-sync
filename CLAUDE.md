# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with HMR at http://localhost:5173
- `npm run build` - Create production build
- `npm run start` - Start production server from built files
- `npm run typecheck` - Generate types and run TypeScript checks
- `npm test` - Run Vitest test suite

## Architecture Overview

This is a React Router v7 application with server-side rendering enabled by default. The project uses modern React (v19) with TypeScript and TailwindCSS for styling.

### Key Architecture Elements

- **Routes Configuration**: Routes are defined in `app/routes.ts` using the new React Router v7 config-based routing
- **File-based Route Structure**: Route components live in `app/routes/` directory
- **Root Layout**: `app/root.tsx` contains the root layout with HTML structure, error boundaries, and global CSS
- **Type Safety**: TypeScript with strict mode enabled, path alias `~/*` maps to `./app/*`
- **SSR**: Server-side rendering is enabled in `react-router.config.ts` (can be disabled for SPA mode)

### Styling and Assets

- TailwindCSS v4 configured via Vite plugin
- Global styles in `app/app.css`
- Font: Inter loaded from Google Fonts

### Build and Deployment

- **Build output**: `build/client/` (static assets) and `build/server/` (SSR code)
- **Docker**: Multi-stage Dockerfile optimized for production
- **Netlify**: Configured for deployment with Netlify plugin
- **Vite plugins**: React Router, TailwindCSS, TypeScript paths, and Netlify integration

### Type Generation

React Router automatically generates route types. Run `npm run typecheck` to generate types and check TypeScript. Types are generated in `.react-router/types/` directory.