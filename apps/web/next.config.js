/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexus/types"],

  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },

  images: {
    domains: ["img.clerk.com", "images.clerk.dev"],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },

  // Bundle analyzer (run with ANALYZE=true npm run build)
  ...(process.env.ANALYZE === "true" && {
    webpack: (config, { isServer: _isServer }) => {
      const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
      config.plugins.push(
        new BundleAnalyzerPlugin({ analyzerMode: "static", openAnalyzer: false })
      );
      return config;
    },
  }),
};

module.exports = nextConfig;
