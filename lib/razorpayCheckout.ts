// Shared client-side type for Razorpay Checkout's `window.Razorpay` global —
// used by every page that opens Checkout (session payment, mid-call
// extension, donation). Declared once so the `declare global` augmentation
// isn't duplicated (and structurally mismatched) across files.
export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  prefill?: { email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}
