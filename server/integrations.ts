/** Provider readiness is built from encrypted server-side configuration. */
import { hasIntegrationSecrets } from "./security/secretVault";

export async function getIntegrationStatus(restaurantId: string) {
  // Canonical vault provider for delivery is "shadowfax". Unified API needs
  // ONLY the token; the webhook entry is OUR callback secret (optional but
  // recommended for production). There is deliberately no MERCHANT_ID.
  const [razorpayStored, otpStored, tokenStored] = await Promise.all([
    hasIntegrationSecrets(restaurantId, "razorpay", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]),
    hasIntegrationSecrets(restaurantId, "otp", ["OTP_PROVIDER_API_KEY"]),
    hasIntegrationSecrets(restaurantId, "shadowfax", ["SHADOWFAX_TOKEN"]),
  ]);
  const envToken = Boolean(process.env.SHADOWFAX_TOKEN);
  const enabled = process.env.SHADOWFAX_ENABLED === "true";

  const { getRazorpayConfig } = await import("./integrations/razorpay");
  const { resolveShadowfaxConfig } = await import("./integrations/shadowfax");
  const [razorpayConfig, shadowfaxConfig] = await Promise.all([
    getRazorpayConfig(restaurantId).catch(() => null),
    resolveShadowfaxConfig(restaurantId).catch(() => null),
  ]);

  // Webhook secrets are deliberately NOT vault keys: inbound webhook routes
  // (POST /webhooks/*) are restaurant-agnostic, so verification reads the
  // server env (RAZORPAY_WEBHOOK_SECRET / SHADOWFAX_WEBHOOK_SECRET). The
  // panel surfaces webhookConfigured so operators can see the env state
  // without ever exposing the value.
  return {
    razorpay: {
      provider: "razorpay",
      name: "Razorpay payments",
      ready: razorpayStored || Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      detail: "Creates payment orders and verifies signed payment callbacks. Webhook secret lives in server env, not the vault.",
      requiredSecrets: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
      // Key prefix family only (rzp_test_ / rzp_live_) — never a secret.
      mode: razorpayConfig?.mode ?? "unknown",
      webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    },
    otp: {
      provider: "otp",
      name: "Customer OTP",
      ready: otpStored,
      detail: "Activates verified customer sign-in once an approved OTP provider is configured.",
      requiredSecrets: ["OTP_PROVIDER_API_KEY"],
    },
    delivery: {
      provider: "delivery",
      name: "Shadowfax delivery (Unified API)",
      ready: (tokenStored || envToken) && enabled,
      detail: enabled
        ? "Token-authenticated marketplace dispatch, AWB tracking, and status webhooks via your callback secret."
        : "Disabled until Shadowfax confirms this API/account is valid for restaurant deliveries. Add the token, then enable dispatch.",
      requiredSecrets: ["SHADOWFAX_TOKEN", "SHADOWFAX_API_BASE_URL"],
      environment: shadowfaxConfig?.environment ?? "production",
      webhookConfigured: Boolean(process.env.SHADOWFAX_WEBHOOK_SECRET),
    },
  } as const;
}
