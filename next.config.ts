import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // There is another package-lock.json in the home folder, so Next was
  // inferring /Users/mac as the workspace root and Turbopack ended up
  // watching and scanning everything under it — pinning the dev server's CPU
  // and starving the event loop (which then showed up as database
  // EAUTHTIMEOUT errors). Pin the root to this project.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  experimental: {
    serverActions: {
      /**
       * Receipts, bills and maintenance photos are posted through Server
       * Actions, and the default body limit is 1MB. Over that, the request is
       * killed before the action runs, so nothing can redirect back with a
       * reason and the user just gets a blank "server error" page. 4.5MB is
       * Vercel's own request ceiling, so asking for more would buy nothing; the
       * per-file cap in `lib/upload-limits.ts` sits under this and is the limit
       * users actually meet, in the form, with an explanation.
       */
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
