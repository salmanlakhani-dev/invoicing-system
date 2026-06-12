import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";
import admin from "firebase-admin";

/**
 * Delivers the invoice payment link via Resend.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "invoiceId is required" }, { status: 400 });
    }

    // 1. Fetch Invoice
    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }
    const invoice = invoiceSnap.data();

    // 2. Fetch Customer Details
    const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
    if (!customerSnap.exists) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
    }
    const customer = customerSnap.data();

    // 3. Fetch Company Details
    const companySnap = await adminDb.collection("settings").doc("company").get();
    const company = companySnap.exists ? companySnap.data() : {};

    // 4. Fetch SMTP settings
    const smtpSnap = await adminDb.collection("settings").doc("smtp").get();
    if (!smtpSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Email configurations are missing. Setup Email in Settings first." },
        { status: 400 }
      );
    }
    const smtpConfig = smtpSnap.data();

    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: invoice.currency || "CAD",
    }).format(invoice.total) + ` ${invoice.currency || "CAD"}`;
    const formattedDueDate = new Date(invoice.dueDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });

    const payUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/${invoice.token}`;

    const subject = `Invoice ${invoice.invoiceNumber} from ${company.companyName || "Elevate TM Invoicing"} — ${formattedAmount} Due ${formattedDueDate}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
          <div style="background-color: #2A2A6C; color: #FFFFFF; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 22px;">Invoice ${invoice.invoiceNumber}</h1>
            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.8;">from ${company.companyName || "us"}</p>
          </div>
          <div style="padding: 30px; color: #1A1A2E; line-height: 1.6; font-size: 14px;">
            <p>Dear ${customer.firstName} ${customer.lastName},</p>
            <p>We have prepared invoice <strong>${invoice.invoiceNumber}</strong> for services rendered. The total amount due is <strong>${formattedAmount}</strong>, payable by <strong>${formattedDueDate}</strong>.</p>
            
            <div style="background-color: #F5F6FA; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #E5E7EB;">
              <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                <tr>
                  <td style="color: #6B7280; padding: 4px 0;">Invoice #:</td>
                  <td style="font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; padding: 4px 0;">Due Date:</td>
                  <td style="font-weight: bold; text-align: right;">${formattedDueDate}</td>
                </tr>
                <tr style="border-top: 1px solid #E5E7EB; font-size: 15px;">
                  <td style="color: #2A2A6C; font-weight: bold; padding: 10px 0 0 0;">Total Amount Due:</td>
                  <td style="color: #2A2A6C; font-weight: bold; text-align: right; padding: 10px 0 0 0;">${formattedAmount}</td>
                </tr>
              </table>
            </div>
            
            <p style="text-align: center; margin: 30px 0;">
              <a href="${payUrl}" style="background-color: #FE1D66; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(254, 29, 102, 0.25);">
                View & Pay Invoice Online
              </a>
            </p>
            
            <p>You can view the invoice online and download a PDF copy for your records using the link above.</p>
            <p>If you have any questions, please reply directly to this email.</p>
          </div>
          <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; font-size: 11px; color: #6B7280; text-align: center;">
            Sent securely by Elevate TM Invoicing on behalf of ${company.companyName || "Elevate TM Invoicing"}.
          </div>
        </div>
      `;

    console.log("Sending email...");
    await sendEmail({
      to: customer.email,
      subject,
      html,
      smtpConfig,
      company,
    });
    console.log("Email sent successfully.");

    // 9. Update Invoice Status
    const updatePayload = {
      sentAt: new Date().toISOString(),
    };
    if (invoice.status === "Draft") {
      updatePayload.status = "Sent";
    }
    await invoiceRef.update(updatePayload);

    return NextResponse.json({
      success: true,
      message: `Invoice email successfully sent to ${customer.email}!`,
    });
  } catch (err) {
    console.error("Email Invoicing Route Failure:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to send invoice email" }, { status: 500 });
  }
}
