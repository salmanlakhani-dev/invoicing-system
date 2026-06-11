import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import Stripe from "stripe";

/**
 * Public route handler for the Pay page, fetching invoice parameters securely by token,
 * setting viewedAt timestamps, and provisioning a Stripe PaymentIntent.
 */
export async function GET(req, { params }) {
  try {
    const { token } = params;

    if (!token) {
      return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
    }

    // 1. Query Invoice by UUID token
    const invoicesRef = adminDb.collection("invoices");
    const querySnap = await invoicesRef.where("token", "==", token).limit(1).get();

    if (querySnap.empty) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const invoiceDoc = querySnap.docs[0];
    const invoiceId = invoiceDoc.id;
    const invoice = invoiceDoc.data();

    // 2. Fetch Customer details
    const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
    if (!customerSnap.exists) {
      return NextResponse.json({ success: false, error: "Recipient client profile not found" }, { status: 404 });
    }
    const customer = customerSnap.data();

    // 3. Fetch Company settings
    const companySnap = await adminDb.collection("settings").doc("company").get();
    const company = companySnap.exists ? companySnap.data() : {};

    // 4. Update viewedAt timestamp and status (Sent -> Viewed)
    const updateData = {};
    if (!invoice.viewedAt) {
      updateData.viewedAt = new Date().toISOString();
      if (invoice.status === "Sent") {
        updateData.status = "Viewed";
      }
      await invoicesRef.doc(invoiceId).update(updateData);
      
      // Update local invoice object for response
      invoice.viewedAt = updateData.viewedAt;
      if (updateData.status) invoice.status = updateData.status;
    }

    // 5. Generate Stripe PaymentIntent if invoice has outstanding balance
    const balanceDue = invoice.total - (invoice.amountPaid || 0);
    let clientSecret = "";
    let publishableKey = "";

    // Fetch stripe keys from settings or env
    const stripeSnap = await adminDb.collection("settings").doc("stripe").get();
    const stripeConfig = stripeSnap.exists ? stripeSnap.data() : {};
    publishableKey = stripeConfig.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_Dummy";

    if (balanceDue > 0) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const isMock = !stripeSecretKey || stripeSecretKey.includes("DummySecretKey");

      if (!isMock) {
        // Execute real PaymentIntent
        try {
          const stripe = new Stripe(stripeSecretKey);
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(balanceDue * 100), // convert to cents
            currency: invoice.currency.toLowerCase(),
            customer: (customer.stripeCustomerId && !customer.stripeCustomerId.startsWith("cus_mock")) ? customer.stripeCustomerId : undefined,
            metadata: {
              invoiceId,
              invoiceNumber: invoice.invoiceNumber
            }
          });
          clientSecret = paymentIntent.client_secret;
        } catch (stripeErr) {
          console.error("Stripe PaymentIntent Error:", stripeErr);
        }
      } else {
        // Mock clientSecret for local dev sandbox
        clientSecret = "pi_mock_secret_" + Math.random().toString(36).substring(2, 12);
        console.log("Mock Stripe Environment: Emitted mock clientSecret.");
      }
    }

    return NextResponse.json({
      success: true,
      invoice: { id: invoiceId, ...invoice },
      customer,
      company,
      clientSecret,
      publishableKey
    });
  } catch (err) {
    console.error("Public Invoice Fetch Failure:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to load invoice" }, { status: 500 });
  }
}
