/** Provider readiness is built from encrypted server-side configuration. */
import { hasIntegrationSecrets } from "./security/secretVault";

const RESTAURANT_ID = "rest_spice_garden";

export async function getIntegrationStatus() {
  const [razorpayStored, otpStored, deliveryStored] = await Promise.all([
    hasIntegrationSecrets(RESTAURANT_ID, "razorpay", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]),
    hasIntegrationSecrets(RESTAURANT_ID, "otp", ["OTP_PROVIDER_API_KEY"]),
    hasIntegrationSecrets(RESTAURANT_ID, "delivery", ["SHADOWFAX_API_KEY", "SHADOWFAX_MERCHANT_ID"]),
  ]);

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
      name: "Shadowfax delivery",
      ready: deliveryStored || Boolean(process.env.SHADOWFAX_API_KEY && process.env.SHADOWFAX_MERCHANT_ID),
      detail: "Receives signed rider and fulfillment status webhooks from Shadowfax.",
      requiredSecrets: ["SHADOWFAX_API_KEY", "SHADOWFAX_MERCHANT_ID"],
    },
  } as const;
}
