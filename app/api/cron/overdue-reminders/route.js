import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";

export async function GET(req) {
  return handleCron(req);
}

export async function POST(req) {
  return handleCron(req);
}

async function handleCron(req) {
  try {
    // 1. Verify Authorization Header (if CRON_SECRET is configured)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isDev = process.env.NODE_ENV === "development";

    if (!isDev && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch Company details (shared across emails)
    const companySnap = await adminDb.collection("settings").doc("company").get();
    const company = companySnap.exists ? companySnap.data() : {};

    // 3. Fetch SMTP/Resend settings
    const smtpSnap = await adminDb.collection("settings").doc("smtp").get();
    if (!smtpSnap.exists && !process.env.RESEND_API_KEY) {
      console.warn("[Cron Reminders] Email configurations are missing. Skipping cron run.");
      return NextResponse.json({ success: false, error: "Email setup is incomplete." }, { status: 400 });
    }
    const smtpConfig = smtpSnap.exists ? smtpSnap.data() : {};

    // 4. Query Unpaid Invoices
    const invoicesRef = adminDb.collection("invoices");
    const querySnap = await invoicesRef
      .where("status", "in", ["Sent", "Viewed", "Partially Paid", "Overdue"])
      .get();

    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const overdueInvoices = [];

    querySnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      // Ensure due date is passed, balance is outstanding, and reminder hasn't been sent yet
      const balanceDue = data.total - (data.amountPaid || 0);
      if (
        data.dueDate &&
        data.dueDate < todayStr &&
        balanceDue > 0 &&
        !data.overdueReminderSent
      ) {
        overdueInvoices.push({ id: docSnap.id, ...data, balanceDue });
      }
    });

    console.log(`[Cron Reminders] Found ${overdueInvoices.length} unpaid overdue invoices to process.`);
    const results = [];

    // 5. Process Reminders sequentially
    for (const invoice of overdueInvoices) {
      try {
        // Fetch Customer
        const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
        if (!customerSnap.exists) {
          console.warn(`[Cron Reminders] Customer ID ${invoice.customerId} not found for invoice ${invoice.invoiceNumber}. Skipping.`);
          continue;
        }
        const customer = customerSnap.data();

        const formattedBalance = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: invoice.currency || "CAD",
        }).format(invoice.balanceDue) + ` ${invoice.currency || "CAD"}`;

        const formattedDueDate = new Date(invoice.dueDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "2-digit"
        });

        const payUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/${invoice.token}`;
        const subject = `Overdue Payment Reminder: Invoice ${invoice.invoiceNumber} — ${formattedBalance} Past Due`;

        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
            <div style="background-color: #FE1D66; color: #FFFFFF; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 22px;">Overdue Payment Reminder</h1>
              <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Invoice ${invoice.invoiceNumber}</p>
            </div>
            <div style="padding: 30px; color: #1A1A2E; line-height: 1.6; font-size: 14px;">
              <p>Dear ${customer.firstName} ${customer.lastName},</p>
              <p>This is a friendly reminder that payment for invoice <strong>${invoice.invoiceNumber}</strong> was due on <strong>${formattedDueDate}</strong> and is now past due.</p>
              <p>The outstanding balance is <strong>${formattedBalance}</strong>.</p>
              
              <div style="background-color: #FFF5F5; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #FED7D7;">
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                  <tr>
                    <td style="color: #4A5568; padding: 4px 0;">Invoice #:</td>
                    <td style="font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="color: #4A5568; padding: 4px 0;">Original Due Date:</td>
                    <td style="font-weight: bold; text-align: right; color: #E53E3E;">${formattedDueDate}</td>
                  </tr>
                  <tr style="border-top: 1px solid #FED7D7; font-size: 15px;">
                    <td style="color: #E53E3E; font-weight: bold; padding: 10px 0 0 0;">Outstanding Balance:</td>
                    <td style="color: #E53E3E; font-weight: bold; text-align: right; padding: 10px 0 0 0;">${formattedBalance}</td>
                  </tr>
                </table>
              </div>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${payUrl}" style="background-color: #FE1D66; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(254, 29, 102, 0.25);">
                  Pay Overdue Invoice Online
                </a>
              </p>
              
              <p>We kindly request that you settle this balance at your earliest convenience. You can make an instant, secure payment by card online using the link above.</p>
              <p>If you have already sent your payment or if you believe there is an error, please contact us immediately so we can update your file.</p>
              <p>Thank you for your business,</p>
              <p><strong>${company.companyName || "Elevate Marketing Group"}</strong></p>
            </div>
            <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; font-size: 11px; color: #6B7280; text-align: center;">
              Sent securely by Elevate TM Invoicing on behalf of ${company.companyName || "Elevate TM Invoicing"}.
            </div>
          </div>
        `;

        // Send Email
        await sendEmail({
          to: customer.email,
          subject,
          html,
          smtpConfig,
          company,
        });

        // Update Firestore
        await invoicesRef.doc(invoice.id).update({
          status: "Overdue",
          overdueReminderSent: true,
          overdueReminderSentAt: new Date().toISOString(),
        });

        results.push({ invoiceNumber: invoice.invoiceNumber, status: "Sent" });
        console.log(`[Cron Reminders] Sent reminder for Invoice ${invoice.invoiceNumber} to ${customer.email}.`);
      } catch (invoiceErr) {
        console.error(`[Cron Reminders] Failed to send reminder for ${invoice.invoiceNumber}:`, invoiceErr);
        results.push({ invoiceNumber: invoice.invoiceNumber, status: "Failed", error: invoiceErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: overdueInvoices.length,
      results
    });
  } catch (err) {
    console.error("[Cron Reminders System Failure]:", err);
    return NextResponse.json({ success: false, error: err.message || "Cron handler crashed" }, { status: 500 });
  }
}
