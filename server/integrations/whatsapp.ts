/**
 * Notification provider abstraction for WhatsApp/SMS order notifications.
 * Supports Meta Cloud API (WhatsApp Business) and fallback SMS via MSG91/Twilio.
 */

/**
 * Normalise any stored customer number to the E.164 form providers require:
 * country code + national number, digits only, no `+`.
 *
 * Orders store `customerPhone` as a bare 10-digit local number (the strict
 * normaliser strips `91`/`0`), but Meta's `to` and MSG91's `mobiles` both need
 * `919810273645`. Passing the raw column value made every single order
 * notification fail — and because the error body was discarded, with no log line
 * at all. Normalising at the provider boundary means delivery no longer depends
 * on which form the caller happened to store.
 */
export function toProviderPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // Already carries a country code (12+ digits starting 91, or any 11-15 digit
  // international number) — leave it alone.
  if (digits.length >= 11) return digits;
  return `91${digits}`;
}

/** Extract a provider error message so failures are never silent. */
async function readProviderError(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as {
      error?: { message?: string; error_data?: { messaging_product?: string } };
      message?: string;
    };
    return data?.error?.message ?? data?.message ?? undefined;
  } catch {
    return undefined;
  }
}

export interface NotificationProvider {
  sendText(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendTemplate(phone: string, templateName: string, params: Record<string, string>): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export class WhatsAppCloudAdapter implements NotificationProvider {
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  async sendText(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const to = toProviderPhone(phone);
    if (!to) return { success: false, error: "No usable phone number." };
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      });
      if (!res.ok) {
        // Surface why. A non-2xx here used to be swallowed, so an invalid token
        // or a rate limit looked identical to success in the logs.
        const error = await readProviderError(res);
        console.error(
          `[WhatsApp] send failed (${res.status}) to=${to}: ${error ?? "no error body"}`
        );
        return { success: false, error: error ?? `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { messages?: Array<{ id?: string }> };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (err) {
      console.error(`[WhatsApp] send threw for to=${to}:`, err);
      return { success: false, error: err instanceof Error ? err.message : "network error" };
    }
  }

  async sendTemplate(phone: string, templateName: string, params: Record<string, string>) {
    try {
      const components = Object.entries(params).map(([key, value], index) => ({
        type: "text",
        text: value,
      }));
      const res = await fetch(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components: [{ type: "body", parameters: components.map(p => ({ type: "text", text: p.text })) }],
          },
        }),
      });
      const data = await res.json();
      return { success: res.ok, messageId: data.messages?.[0]?.id };
    } catch {
      return { success: false };
    }
  }
}

export class SmsFallbackAdapter implements NotificationProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // H-10: Use POST with body instead of GET with API key in URL
  async sendText(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const to = toProviderPhone(phone);
    if (!to) return { success: false, error: "No usable phone number." };
    try {
      const res = await fetch("https://api.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authkey": this.apiKey,
        },
        body: JSON.stringify({
          mobiles: to,
          message: message,
        }),
      });
      if (!res.ok) {
        const error = await readProviderError(res);
        console.error(`[SMS] send failed (${res.status}) to=${to}: ${error ?? "no error body"}`);
        return { success: false, error: error ?? `HTTP ${res.status}` };
      }
      return { success: true };
    } catch (err) {
      console.error(`[SMS] send threw for to=${to}:`, err);
      return { success: false, error: err instanceof Error ? err.message : "network error" };
    }
  }

  async sendTemplate(_phone: string, _templateName: string, _params: Record<string, string>): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // MSG91's /api/v5/flow/ endpoint is template-driven and needs a template id,
    // which is not configured anywhere in this project. Reporting success here
    // would be a lie, so this stays an explicit, logged failure.
    return { success: false, error: "MSG91 template sending is not configured." };
  }
}

const TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  order_confirmed: (d) => `Your order #${d.orderNumber} is confirmed! We'll start preparing it shortly. Track: ${d.trackUrl}`,
  preparing: (d) => `We're preparing your order #${d.orderNumber}. It'll be ready soon!`,
  out_for_delivery: (d) => `Your order #${d.orderNumber} is on its way! Track: ${d.trackUrl}`,
  delivered: (d) => `Order #${d.orderNumber} has been delivered. Enjoy your meal! Rate us: ${d.rateUrl}`,
  cancelled: (d) => `Order #${d.orderNumber} has been cancelled. Refund will be processed within 3-5 business days.`,
};

export function buildNotificationMessage(type: string, data: Record<string, string>): string | null {
  const builder = TEMPLATES[type];
  if (!builder) return null;
  return builder(data);
}
