import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmail, sendPaymentSuccessNotifications } from "@/lib/email";
import Stripe from "stripe";

/**
 * POST handler for Stripe Webhook events.
 * Listens for payment_intent.succeeded, payment_intent.payment_failed, and setup_intent.succeeded.
 * Triggers status updates in Firestore, records payment documents, and sends out email receipts.
 */
export async function POST(req) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    const isMock = !stripeKey || stripeKey.includes("DummySecretKey") || stripeKey.includes("Dummy");
    const isWebhookSecretMock = !webhookSecret || webhookSecret.includes("Dummy") || webhookSecret.includes("whsec_Dummy");

    let event;

    if (!isMock && !isWebhookSecretMock && signature) {
      try {
        const stripe = new Stripe(stripeKey);
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json(
          { success: false, error: `Webhook signature verification failed: ${err.message}` },
          { status: 400 }
        );
      }
    } else {
      // Mock Sandbox webhook parse (no signature validation required for local testing)
      try {
        event = JSON.parse(body);
        console.log(`[Stripe Webhook Sandbox] Bypass signature verification. Event Type: ${event.type}`);
      } catch (err) {
        console.error("Failed to parse mock webhook JSON body:", err);
        return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
      }
    }

    const eventType = event.type;

    if (eventType === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const invoiceId = paymentIntent.metadata?.invoiceId;

      console.log(`[Stripe Webhook] payment_intent.succeeded for invoiceId: ${invoiceId}`);

      if (invoiceId) {
        const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();

        if (invoiceSnap.exists) {
          const invoiceData = invoiceSnap.data();

          if (invoiceData.status !== "Paid") {
            const paidAt = new Date().toISOString();

            // 1. Update Invoice status to Paid
            await invoiceRef.update({
              status: "Paid",
              amountPaid: invoiceData.total,
              paidAt,
            });

            // 2. Add payment record log
            await adminDb.collection("payments").add({
              invoiceId,
              amount: invoiceData.total - (invoiceData.amountPaid || 0),
              currency: invoiceData.currency || "CAD",
              method: "Stripe",
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: paymentIntent.latest_charge || null,
              paidAt,
              recordedBy: "Stripe Webhook (payment_intent.succeeded)",
            });

            console.log(`[Stripe Webhook] Invoice ${invoiceId} marked as Paid in Firestore.`);

            // 3. Send payment success notification emails to customer and admin
            try {
              await sendPaymentSuccessNotifications({
                invoiceId,
                paidAt,
                paymentIntentId: paymentIntent.id
              });
            } catch (emailErr) {
              console.error("[Stripe Webhook] Error sending payment success emails:", emailErr);
            }
          } else {
            console.log(`[Stripe Webhook] Invoice ${invoiceId} was already marked Paid.`);
          }
        } else {
          console.warn(`[Stripe Webhook] Invoice ID ${invoiceId} not found in database.`);
        }
      } else {
        console.warn("[Stripe Webhook] payment_intent.succeeded received but lacked invoiceId metadata.");
      }
    } else if (eventType === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const invoiceId = paymentIntent.metadata?.invoiceId;
      const failureMessage = paymentIntent.last_payment_error?.message || "Unknown payment decline reason.";

      console.warn(`[Stripe Webhook] payment_intent.payment_failed for invoiceId: ${invoiceId}. Reason: ${failureMessage}`);

      if (invoiceId) {
        const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();

        if (invoiceSnap.exists) {
          const invoiceData = invoiceSnap.data();
          
          // Log failed payment activity in database payments sub-history or update error log
          await adminDb.collection("payment_failures").add({
            invoiceId,
            stripePaymentIntentId: paymentIntent.id,
            error: failureMessage,
            failedAt: new Date().toISOString(),
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency.toUpperCase(),
          });

          // Ensure invoice status stays as Sent/Viewed (do not switch back to Draft)
          if (invoiceData.status === "Draft") {
            await invoiceRef.update({ status: "Sent" });
          }
        }
      }
    } else if (eventType === "setup_intent.succeeded") {
      const setupIntent = event.data.object;
      const stripeCustomerId = setupIntent.customer;
      const paymentMethodId = setupIntent.payment_method;

      console.log(`[Stripe Webhook] setup_intent.succeeded. Customer: ${stripeCustomerId}, PaymentMethod: ${paymentMethodId}`);

      if (stripeCustomerId && paymentMethodId) {
        // Query Customer by stripeCustomerId
        const customerSnap = await adminDb
          .collection("customers")
          .where("stripeCustomerId", "==", stripeCustomerId)
          .limit(1)
          .get();

        if (!customerSnap.empty) {
          const customerDoc = customerSnap.docs[0];
          const customerId = customerDoc.id;
          const cardSubcolRef = adminDb.collection("customers").doc(customerId).collection("paymentMethods");

          // Check if payment method is already saved in Firestore subcollection
          const existingSnap = await cardSubcolRef.where("paymentMethodId", "==", paymentMethodId).limit(1).get();

          if (existingSnap.empty) {
            // Retrieve PaymentMethod parameters from Stripe to save basic details (last4, brand, expiry)
            let cardInfo = {
              brand: "card",
              last4: "xxxx",
              expiry: "xx/xx",
            };

            if (!isMock) {
              try {
                const stripe = new Stripe(stripeKey);
                const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
                if (pm.card) {
                  cardInfo = {
                    brand: pm.card.brand || "card",
                    last4: pm.card.last4 || "xxxx",
                    expiry: `${pm.card.exp_month}/${pm.card.exp_year}`,
                  };
                }
              } catch (stripeErr) {
                console.error("[Stripe Webhook] Error fetching Stripe payment method details:", stripeErr);
              }
            } else {
              // Simulated Mock properties
              cardInfo = {
                brand: "visa",
                last4: "4242",
                expiry: "12/28",
              };
            }

            // Save credit card profile to Firestore subcollection
            await cardSubcolRef.add({
              paymentMethodId,
              brand: cardInfo.brand,
              last4: cardInfo.last4,
              expiry: cardInfo.expiry,
              allowOffSession: false, // Default settings, system owner toggles
              createdAt: new Date().toISOString(),
            });

            console.log(`[Stripe Webhook] Attached & saved card ${paymentMethodId} to customer ${customerId}.`);
          } else {
            console.log(`[Stripe Webhook] Card ${paymentMethodId} already exists for customer ${customerId}.`);
          }
        } else {
          console.warn(`[Stripe Webhook] Customer with stripeCustomerId ${stripeCustomerId} not found in Firestore.`);
        }
      }
    } else {
      console.log(`[Stripe Webhook] Unhandled event type received: ${eventType}`);
    }

    return NextResponse.json({ success: true, received: true });
  } catch (err) {
    console.error("[Stripe Webhook Router Failure]:", err);
    return NextResponse.json({ success: false, error: err.message || "Webhook handler crashed" }, { status: 500 });
  }
}


