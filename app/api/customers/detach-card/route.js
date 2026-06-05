import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

/**
 * Detaches a PaymentMethod from a Stripe Customer.
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

    await stripe.paymentMethods.detach(paymentMethodId);

    return NextResponse.json({
      success: true,
      message: "Card detached successfully",
    });
  } catch (err) {
    console.error("Stripe Card Detach Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to detach payment method" },
      { status: 500 }
    );
  }
}
