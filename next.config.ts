import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para unauthorized() (next/navigation), usado pelo
  // placeholder de auth de src/app/(admin)/layout.tsx — spec §12.
  experimental: {
    authInterrupts: true,
  },
  // bullmq/ioredis ficam fora do bundle do webpack — evita o warning
  // "Module not found: @valkey/valkey-glide" (dependência opcional do
  // bullmq que o webpack tenta resolver mesmo sem estar instalada).
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
