/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@chatuncle/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'pps.whatsapp.net',
      },
    ],
  },
  // NEXT_PUBLIC_* variables are automatically exposed to the client
  // No need to define them here - they're read from Vercel env vars at build time
};

module.exports = nextConfig;
