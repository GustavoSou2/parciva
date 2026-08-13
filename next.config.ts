import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para unauthorized() (next/navigation), usado pelo
  // placeholder de auth de src/app/(admin)/layout.tsx — spec §12.
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
