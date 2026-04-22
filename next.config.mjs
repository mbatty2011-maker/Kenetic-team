/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["ssh2"],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
