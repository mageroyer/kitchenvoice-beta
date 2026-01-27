/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable image optimization for Firebase Storage URLs
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/**',
      },
    ],
  },
  // Enable ISR (Incremental Static Regeneration)
  // Pages will be regenerated every 5 minutes
  experimental: {
    // Enable PPR for faster builds in the future
  },
};

module.exports = nextConfig;
