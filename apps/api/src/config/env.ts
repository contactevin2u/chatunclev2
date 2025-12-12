import dotenv from 'dotenv';
dotenv.config();

/**
 * Get required environment variable
 * Throws in production if missing, returns empty string in development
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

/**
 * Get optional environment variable with default
 */
function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // === SERVER ===
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // === DATABASE ===
  databaseUrl: requireEnv('DATABASE_URL'),

  // === AUTHENTICATION ===
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),

  // === CORS ===
  corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:3000'),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),

  // === CLOUDINARY (Media Storage) ===
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    isConfigured: !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ),
  },

  // === ORDEROPS INTEGRATION ===
  orderops: {
    apiUrl: process.env.ORDEROPS_API_URL,
    username: process.env.ORDEROPS_USERNAME,
    password: process.env.ORDEROPS_PASSWORD,
    isConfigured: !!(
      process.env.ORDEROPS_API_URL &&
      process.env.ORDEROPS_USERNAME &&
      process.env.ORDEROPS_PASSWORD
    ),
  },

  // === OPENAI (AI Reply) ===
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    isConfigured: !!process.env.OPENAI_API_KEY,
  },

  // === META (Instagram/Messenger) ===
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.META_VERIFY_TOKEN,
    isConfigured: !!(
      process.env.META_APP_ID &&
      process.env.META_APP_SECRET &&
      process.env.META_VERIFY_TOKEN
    ),
  },

  // === TIKTOK SHOP ===
  tiktok: {
    appKey: process.env.TIKTOK_APP_KEY,
    appSecret: process.env.TIKTOK_APP_SECRET,
    isConfigured: !!(
      process.env.TIKTOK_APP_KEY &&
      process.env.TIKTOK_APP_SECRET
    ),
  },

  // === REDIS (Optional - for scaling) ===
  redis: {
    url: process.env.REDIS_URL,
    isConfigured: !!process.env.REDIS_URL,
  },
} as const;

// Type for the config object
export type Config = typeof config;

// Validate critical config on startup
export function validateConfig(): void {
  const missing: string[] = [];

  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.jwtSecret) missing.push('JWT_SECRET');

  if (missing.length > 0 && config.isProd) {
    throw new Error(
      `Missing critical environment variables: ${missing.join(', ')}`
    );
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
  }

  // Log configured integrations
  console.log('📦 Configured integrations:');
  console.log(`   - Cloudinary: ${config.cloudinary.isConfigured ? '✅' : '❌'}`);
  console.log(`   - OrderOps: ${config.orderops.isConfigured ? '✅' : '❌'}`);
  console.log(`   - OpenAI: ${config.openai.isConfigured ? '✅' : '❌'}`);
  console.log(`   - Meta (IG/Messenger): ${config.meta.isConfigured ? '✅' : '❌'}`);
  console.log(`   - TikTok Shop: ${config.tiktok.isConfigured ? '✅' : '❌'}`);
  console.log(`   - Redis: ${config.redis.isConfigured ? '✅' : '❌'}`);
}
