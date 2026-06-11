import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * Route handler to verify Stripe configurations by making a basic API call.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { secretKey } = body;

    // Use the provided key or fall back to local .env configuration
    const stripeKey = secretKey || process.env.STRIPE_SECRET_KEY;

    if (!stripeKey || stripeKey.includes("DummySecretKey")) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Stripe Secret Key is not configured. Please supply a valid sk_test_... or sk_live_... key." 
        },
        { status: 400 }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey);

    // Verify key by retrieving account details
    const accountInfo = await stripe.accounts.retrieve();

    return NextResponse.json({
      success: true,
      message: "Stripe credentials verified successfully!",
      accountName: accountInfo.business_profile?.name || accountInfo.email || "Sandbox Stripe Account",
      chargesEnabled: accountInfo.charges_enabled,
      detailsSubmitted: accountInfo.details_submitted,
    });
  } catch (err) {
    console.error("Stripe Verification Failure:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to authenticate with Stripe. Verify your secret key.",
      },
      { status: 500 }
    );
  }
}
