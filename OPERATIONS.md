# Supperclub Direct Operations Setup

The application now includes a customer-facing ordering flow, a protected restaurant operations console, persistent operational tables, and a secure payment handoff. The **Integrations** section at `/admin/integrations` intentionally reports connection readiness without rendering, storing, or accepting plaintext provider credentials.

| Service | Managed secret keys | Current behavior before configuration |
|---|---|---|
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Checkout remains visibly disabled and no order is represented as paid. |
| Customer OTP | `OTP_PROVIDER_API_KEY` | The current sign-in UI remains a preview boundary; connect the approved OTP provider before live customer verification. |
| Delivery provider | `DELIVERY_PROVIDER_API_KEY`, `DELIVERY_WEBHOOK_SECRET` | The interface can display operational order status, while rider/provider updates await the delivery integration. |

Add provider values through the project’s managed **Settings → Secrets** panel. Do not add them to restaurant settings, database fields, customer records, source files, or browser-accessible variables. Once Razorpay keys are present, the application creates server-side Razorpay orders, opens the provider checkout only after server-side cart validation, and verifies the payment callback signature before an order status changes to **PLACED**.

> The payment adapter never marks an order as paid merely because checkout was opened. It only transitions payment status after the signed provider callback has been verified on the server.
