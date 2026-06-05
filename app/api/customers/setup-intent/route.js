import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

/**
 * Creates a Stripe SetupIntent to securely capture card payment details.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { stripeCustomerId } = body;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: "Stripe Customer ID is required" },
        { status: 400 }
      );
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });

    return NextResponse.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (err) {
    console.error("Stripe SetupIntent Creation Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create SetupIntent" },
      { status: 500 }
    );
  }
}
