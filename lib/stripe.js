import { loadStripe } from "@stripe/stripe-js";

let stripePromise;

/**
 * Lazy loads the Stripe client to prevent server-side rendering issues.
 * Falls back to a dummy public test key if publishable key is not defined.
 */
export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = 
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
      "pk_test_51HXTv7Jn4B9bWd08DummyStripeKey";
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};
