import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createTransporter } from "@/lib/nodemailer";
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
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
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

            // 3. Send email receipt to customer in background (or log failure if SMTP settings not configured)
            try {
              await sendReceiptEmail(invoiceId, invoiceData, paidAt, paymentIntent.id);
            } catch (emailErr) {
              console.error("[Stripe Webhook] Error sending receipt email:", emailErr);
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
                const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
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

/**
 * Delivers a payment receipt confirmation email to the client using SMTP configurations.
 */
async function sendReceiptEmail(invoiceId, invoice, paidAt, paymentIntentId) {
  // 1. Fetch Customer Details
  const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
  if (!customerSnap.exists) {
    console.warn(`[Receipt Email] Customer ID ${invoice.customerId} not found.`);
    return;
  }
  const customer = customerSnap.data();

  // 2. Fetch Company details
  const companySnap = await adminDb.collection("settings").doc("company").get();
  const company = companySnap.exists() ? companySnap.data() : {};

  // 3. Fetch SMTP settings
  const smtpSnap = await adminDb.collection("settings").doc("smtp").get();
  if (!smtpSnap.exists) {
    console.warn("[Receipt Email] SMTP settings are not configured. Skipping confirmation email.");
    return;
  }
  const smtpConfig = smtpSnap.data();

  // 4. Configure SMTP transporter
  const transporter = createTransporter(smtpConfig);

  const fromName = smtpConfig.fromName || company.companyName || "InvoiceFlow";
  const fromEmail = smtpConfig.fromEmail || company.email || "no-reply@invoiceflow.local";

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: invoice.currency || "CAD",
  }).format(invoice.total) + ` ${invoice.currency || "CAD"}`;

  const formattedPaidDate = new Date(paidAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const payUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/${invoice.token}`;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: customer.email,
    subject: `Payment Receipt: Invoice ${invoice.invoiceNumber} paid successfully`,
    html: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background-color: #10B981; color: #FFFFFF; padding: 32px; border-radius: 12px; text-align: center;">
          <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 12px; border-radius: 50%; margin-bottom: 16px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: #FFFFFF; vertical-align: middle;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">Payment Received</h1>
          <p style="margin: 8px 0 0 0; font-size: 14px; font-weight: 500; opacity: 0.9;">Thank you! Your payment is processed.</p>
        </div>

        <div style="padding: 24px 8px; color: #1F2937; line-height: 1.6; font-size: 14px;">
          <p style="font-weight: 600; font-size: 16px; margin-top: 0;">Hi ${customer.firstName} ${customer.lastName},</p>
          <p>This email confirms that we have successfully received your payment of <strong style="color: #10B981; font-size: 16px;">${formattedAmount}</strong> for invoice <strong>${invoice.invoiceNumber}</strong>.</p>
          
          <div style="background-color: #F9FAFB; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #F3F4F6;">
            <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #6B7280; letter-spacing: 0.05em;">Transaction Information</h3>
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="color: #6B7280; padding: 6px 0;">Invoice Reference:</td>
                <td style="font-weight: 600; text-align: right; color: #1F2937;">${invoice.invoiceNumber}</td>
              </tr>
              <tr>
                <td style="color: #6B7280; padding: 6px 0;">Paid Amount:</td>
                <td style="font-weight: 700; text-align: right; color: #10B981;">${formattedAmount}</td>
              </tr>
              <tr>
                <td style="color: #6B7280; padding: 6px 0;">Date Paid:</td>
                <td style="font-weight: 600; text-align: right; color: #1F2937;">${formattedPaidDate}</td>
              </tr>
              <tr>
                <td style="color: #6B7280; padding: 6px 0;">Payment Provider:</td>
                <td style="font-weight: 600; text-align: right; color: #1F2937;">Stripe</td>
              </tr>
              ${paymentIntentId ? `
              <tr>
                <td style="color: #6B7280; padding: 6px 0;">Transaction ID:</td>
                <td style="font-family: monospace; font-size: 11px; text-align: right; color: #4B5563;">${paymentIntentId}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <p style="text-align: center; margin: 32px 0;">
            <a href="${payUrl}" style="background-color: #FE1D66; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(254, 29, 102, 0.2); transition: all 0.2s;">
              View Paid Invoice / Download PDF Receipt
            </a>
          </p>
          
          <p style="color: #6B7280; font-size: 13px;">If you require a copy of the invoice for tax purposes, you can download a PDF statement directly using the button above.</p>
        </div>

        <div style="border-top: 1px solid #F3F4F6; padding-top: 20px; font-size: 11px; color: #9CA3AF; text-align: center; line-height: 1.4;">
          Sent securely by InvoiceFlow on behalf of <strong>${company.companyName || "InvoiceFlow"}</strong>.<br/>
          For billing support or questions, please reply directly to this email.
        </div>
      </div>
    `,
  };

  console.log(`[Receipt Email] Sending confirmation to ${customer.email}...`);
  await transporter.sendMail(mailOptions);
  console.log("[Receipt Email] Sent successfully.");
}
