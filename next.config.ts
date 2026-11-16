import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build checks the application's types only; the tests are checked by "npm run typecheck" (CI), which sees the
  // whole project. With the tests, the check passed 2 GB of memory, Node's default limit on smaller machines
  // (SPEC 2026-11-16-professores-e-tecnicos, section 12).
  typescript: {
    tsconfigPath: "tsconfig.build.json",
  },
  experimental: {
    serverActions: {
      // 4,25 MiB (4.456.448 bytes): 4 MiB of files plus room for the description and the
      // multipart overhead, below the 4.5 MB Vercel Function body limit (SPEC 21.15.3).
      bodySizeLimit: "4.25mb",
    },
  },
};

export default nextConfig;
