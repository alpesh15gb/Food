/** Typed environment variable access with sensible defaults for development. */

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET must be set in production.");
}
if (isProduction && !process.env.COOKIE_SECRET) {
  throw new Error("FATAL: COOKIE_SECRET must be set in production.");
}

export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? (isProduction ? "" : "dev-jwt-secret-not-for-production-use"),
  cookieSecret: process.env.COOKIE_SECRET ?? (isProduction ? "" : "dev-cookie-secret-not-for-production-use"),
  appId: process.env.APP_ID ?? "supperclub-direct",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  secretEncryptionKey: process.env.SECRET_ENCRYPTION_KEY ?? "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  shadowfaxApiUrl: process.env.SHADOWFAX_API_URL ?? "https://api.shadowfax.in",
  shadowfaxApiKey: process.env.SHADOWFAX_API_KEY ?? "",
  shadowfaxMerchantId: process.env.SHADOWFAX_MERCHANT_ID ?? "",
  shadowfaxWebhookSecret: process.env.SHADOWFAX_WEBHOOK_SECRET ?? "",
  assetBaseUrl: process.env.ASSET_BASE_URL ?? "/assets",
  localAdminToken: process.env.LOCAL_ADMIN_TOKEN ?? "",
  businessTimezone: process.env.BUSINESS_TIMEZONE ?? "Asia/Kolkata",
  defaultDeliveryRadiusKm: parseFloat(process.env.DEFAULT_DELIVERY_RADIUS_KM || "5"),
} as const;
