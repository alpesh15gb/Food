/**
 * Notification provider abstraction for WhatsApp/SMS order notifications.
 * Supports Meta Cloud API (WhatsApp Business) and fallback SMS via MSG91/Twilio.
 */

export interface NotificationProvider {
  sendText(phone: string, message: string): Promise<{ success: boolean; messageId?: string }>;
  sendTemplate(phone: string, templateName: string, params: Record<string, string>): Promise<{ success: boolean; messageId?: string }>;
}

export class WhatsAppCloudAdapter implements NotificationProvider {
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  async sendText(phone: string, message: string) {
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        }),
      });
      const data = await res.json();
      return { success: res.ok, messageId: data.messages?.[0]?.id };
    } catch {
      return { success: false };
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
  async sendText(phone: string, message: string) {
    try {
      const res = await fetch("https://api.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authkey": this.apiKey,
        },
        body: JSON.stringify({
          mobiles: phone,
          message: message,
        }),
      });
      return { success: res.ok };
    } catch {
      return { success: false };
    }
  }

  async sendTemplate(_phone: string, _templateName: string, _params: Record<string, string>) {
    return { success: false };
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
