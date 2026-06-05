import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";

/**
 * Executes an off-session credit card charge using a saved Stripe PaymentMethod.
 * Leverages the Firebase Admin SDK to bypass Firestore rules, and includes a fallback 
 * simulation mode for local testing if Stripe keys are placeholders.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { invoiceId, paymentMethodId } = body;

    if (!invoiceId || !paymentMethodId) {
      return NextResponse.json(
        { success: false, error: "invoiceId and paymentMethodId are required" },
        { status: 400 }
      );
    }

    // 1. Fetch Invoice
    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();

    if (!invoiceSnap.exists) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const invoice = invoiceSnap.data();
    const balanceDue = invoice.total - (invoice.amountPaid || 0);

    if (balanceDue <= 0) {
      return NextResponse.json({ success: false, error: "Invoice is already paid in full" }, { status: 400 });
    }

    // 2. Fetch Customer
    const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
    if (!customerSnap.exists) {
      return NextResponse.json({ success: false, error: "Customer profile not found" }, { status: 404 });
    }

    const customer = customerSnap.data();

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isMock = !stripeKey || stripeKey.includes("DummySecretKey");

    let stripeChargeId = "ch_mock_" + Math.random().toString(36).substring(2, 10);
    let stripePaymentIntentId = "pi_mock_" + Math.random().toString(36).substring(2, 10);

    if (!isMock) {
      // Real Stripe charge
      const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(balanceDue * 100), // convert to cents
          currency: invoice.currency.toLowerCase(),
          customer: customer.stripeCustomerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
        });

        if (paymentIntent.status === "succeeded") {
          stripePaymentIntentId = paymentIntent.id;
          stripeChargeId = paymentIntent.latest_charge || "ch_real_" + Math.random().toString(36).substring(2, 10);
        } else {
          throw new Error("Stripe charge failed with status: " + paymentIntent.status);
        }
      } catch (stripeErr) {
        console.error("Real Stripe Charge Failure:", stripeErr);
        return NextResponse.json(
          { success: false, error: stripeErr.message || "Card declined off-session." }, 
          { status: 402 }
        );
      }
    } else {
      console.log("Mock Stripe Environment: Simulating successful off-session charge.");
    }

    // 3. Write transaction log
    const paymentsRef = adminDb.collection("payments");
    const paidAt = new Date().toISOString();
    await paymentsRef.add({
      invoiceId,
      amount: balanceDue,
      currency: invoice.currency,
      method: "Stripe",
      stripePaymentIntentId,
      stripeChargeId,
      paidAt,
      recordedBy: "Automated Off-Session Card Charge"
    });

    // 4. Mark invoice Paid
    await invoiceRef.update({
      amountPaid: invoice.total,
      status: "Paid",
      paidAt,
    });

    return NextResponse.json({
      success: true,
      message: "Card charged successfully off-session!",
      stripePaymentIntentId,
    });
  } catch (err) {
    console.error("Off-session charge route error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to execute charge" }, { status: 500 });
  }
}
