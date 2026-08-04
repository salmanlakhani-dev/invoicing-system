import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Updates a Stripe Customer details.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { stripeCustomerId, name, email, phone, companyName, address } = body;

    if (!stripeCustomerId || stripeCustomerId.startsWith("cus_mock")) {
      // Bypass Stripe update for mock/sandbox seeded customers
      return NextResponse.json({ success: true, bypassed: true });
    }

    const customerParams = {
      name,
      email,
      phone,
      metadata: {
        companyName: companyName || "",
      },
    };

    // Include billing address if provided
    if (address) {
      customerParams.address = {
        line1: address.line1 || "",
        line2: address.line2 || "",
        city: address.city || "",
        state: address.state || "",
        postal_code: address.postalCode || "",
        country: address.country || "",
      };
    }

    await stripe.customers.update(stripeCustomerId, customerParams);

    return NextResponse.json({
      success: true,
    });
  } catch (err) {
    console.error("Stripe Customer Update Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update Stripe Customer" },
      { status: 500 }
    );
  }
}
