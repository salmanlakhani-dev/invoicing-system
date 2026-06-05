import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

/**
 * Retrieves Stripe PaymentMethod details to store in Firestore.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { paymentMethodId } = body;

    if (!paymentMethodId) {
      return NextResponse.json(
        { success: false, error: "Payment Method ID is required" },
        { status: 400 }
      );
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (pm.type !== "card") {
      return NextResponse.json(
        { success: false, error: "Only card payment methods are supported currently" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      card: {
        paymentMethodId: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expiry: `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}`,
      }
    });
  } catch (err) {
    console.error("Retrieve PaymentMethod Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve payment method" },
      { status: 500 }
    );
  }
}
