/** Typed environment variable access with fail-fast validation in production. */

const isProduction = process.env.NODE_ENV === "production";

function requireSecret(name: string, validate?: (v: string) => boolean, hint?: string): string {
  const v = process.env[name];
  if (!v || (validate && !validate(v))) {
    if (isProduction) {
      throw new Error(`FATAL: ${name} ${hint ?? "must be set in production."}`);
    }
    // Development/test-only placeholder — never valid in production.
    // Deliberately NOT "" so accidental use fails loudly downstream.
    return `dev-${name.toLowerCase().replace(/_/g, "-")}-not-for-production`;
  }
  return v;
}

const HEX64 = (v: string) => /^[a-f0-9]{64}$/i.test(v);
const MIN16 = (v: string) => v.length >= 16;

// Fail-fast in production for all load-bearing secrets (no silent "" fallbacks).
const jwtSecret = requireSecret("JWT_SECRET");
const cookieSecret = requireSecret("COOKIE_SECRET");
const secretEncryptionKey = requireSecret(
  "SECRET_ENCRYPTION_KEY",
  HEX64,
  "must be a 64-char hex string in production. Generate with: openssl rand -hex 32"
);
const otpHmacSecret = requireSecret(
  "OTP_HMAC_SECRET",
  MIN16,
  "must be set (min 16 chars) in production. Generate with: openssl rand -hex 32"
);
const localAdminToken = requireSecret(
  "LOCAL_ADMIN_TOKEN",
  MIN16,
  "must be at least 16 chars in production."
);

export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret,
  cookieSecret,
  secretEncryptionKey,
  otpHmacSecret,
  localAdminToken,
  appId: process.env.APP_ID ?? "supperclub-direct",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  shadowfaxApiUrl: process.env.SHADOWFAX_API_URL ?? "https://api.shadowfax.in",
  shadowfaxApiKey: process.env.SHADOWFAX_API_KEY ?? "",
  shadowfaxMerchantId: process.env.SHADOWFAX_MERCHANT_ID ?? "",
  shadowfaxWebhookSecret: process.env.SHADOWFAX_WEBHOOK_SECRET ?? "",
  assetBaseUrl: process.env.ASSET_BASE_URL ?? "/assets",
  businessTimezone: process.env.BUSINESS_TIMEZONE ?? "Asia/Kolkata",
  defaultDeliveryRadiusKm: parseFloat(process.env.DEFAULT_DELIVERY_RADIUS_KM || "5"),
  // Customer OTP dev logging — explicit opt-in, never logs in production (see storefront router).
  otpDevLogEnabled: process.env.OTP_DEV_LOG_ENABLED === "true",
  publicUrl: process.env.PUBLIC_URL ?? "",
  // Optional notification providers (WhatsApp Cloud API + MSG91 SMS fallback).
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  msg91AuthKey: process.env.MSG91_AUTH_KEY ?? "",
  // Custom-domain CNAME target shown in admin DNS instructions (wired from admin router).
  domainCnameTarget: process.env.DOMAIN_CNAME_TARGET ?? "cname.yourdomain.com",
} as const;
