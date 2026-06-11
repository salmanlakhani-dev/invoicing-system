import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Creates a Stripe Customer for customer billing integrations.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { name, email, phone, companyName, address } = body;

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

    const stripeCustomer = await stripe.customers.create(customerParams);

    return NextResponse.json({
      success: true,
      stripeCustomerId: stripeCustomer.id,
    });
  } catch (err) {
    console.error("Stripe Customer Provisioning Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to provision Stripe Customer" },
      { status: 500 }
    );
  }
}
