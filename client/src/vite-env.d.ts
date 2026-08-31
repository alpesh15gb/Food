/// <reference types="vite/client" />

interface Window {
  Razorpay?: new (options: {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    order_id: string;
    handler: (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => void;
    modal?: {
      ondismiss?: () => void;
    };
  }) => {
    open: () => void;
  };
}

interface ImportMetaEnv {
  readonly VITE_OAUTH_PORTAL_URL: string;
  readonly VITE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
