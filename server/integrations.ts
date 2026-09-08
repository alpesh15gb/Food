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

  return {
    razorpay: {
      provider: "razorpay",
      name: "Razorpay payments",
      ready: razorpayStored || Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      detail: "Creates payment orders and verifies signed payment callbacks.",
      requiredSecrets: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
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
      requiredSecrets: ["SHADOWFAX_TOKEN", "SHADOWFAX_WEBHOOK_SECRET"],
    },
  } as const;
}
