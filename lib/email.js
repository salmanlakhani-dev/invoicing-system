import "server-only";
import { adminDb } from "./firebase-admin";

/**
 * Simple decryption placeholder (Base64) for API keys.
 */
export const decryptKey = (encryptedKey) => {
  if (!encryptedKey) return "";
  try {
    return Buffer.from(encryptedKey, 'base64').toString('utf-8');
  } catch (e) {
    return encryptedKey;
  }
};

/**
 * Simple encryption placeholder (Base64) for API keys.
 */
export const encryptKey = (key) => {
  if (!key) return "";
  return Buffer.from(key).toString('base64');
};

/**
 * Sends an email using Resend API.
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject line
 * @param {string} params.html - Email body in HTML format
 * @param {Array} [params.attachments] - Array of attachment objects
 * @param {Object} [params.emailConfig] - Email configurations from settings (e.g. resend api key)
 * @param {Object} [params.smtpConfig] - Backwards-compatible configuration alias
 * @param {Object} [params.company] - Company settings
 */
export async function sendEmail({ to, subject, html, attachments = [], emailConfig = {}, smtpConfig = {}, company = {} }) {
  const config = { ...smtpConfig, ...emailConfig };
  const fromName = config.fromName || company.companyName || "Elevate TM Invoicing";
  const fromEmail = config.fromEmail || company.email || "no-reply@elevatetm.com";

  let resendApiKey = process.env.RESEND_API_KEY || "";
  // If settings overrides the key
  if (config.encryptedResendApiKey) {
    resendApiKey = decryptKey(config.encryptedResendApiKey);
  } else if (config.resendApiKey) {
    resendApiKey = config.resendApiKey;
  }

  if (!resendApiKey) {
    throw new Error("Resend API Key is missing. Please add RESEND_API_KEY to settings or environment variables.");
  }

  // Convert attachments to Resend format (base64 string content)
  const resendAttachments = attachments.map(att => {
    let contentBase64 = "";
    if (Buffer.isBuffer(att.content)) {
      contentBase64 = att.content.toString("base64");
    } else if (typeof att.content === "string") {
      contentBase64 = Buffer.from(att.content).toString("base64");
    } else {
      contentBase64 = att.content;
    }
    return {
      filename: att.filename,
      content: contentBase64,
    };
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `"${fromName}" <${fromEmail}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Resend API returned status ${response.status}`);
  }

  return await response.json();
}

/**
 * Sends transaction receipt confirmation emails to both customer and business admin.
 */
export async function sendPaymentSuccessNotifications({ invoiceId, paidAt, paymentIntentId }) {
  try {
    // 1. Fetch Invoice
    const invoiceSnap = await adminDb.collection("invoices").doc(invoiceId).get();
    if (!invoiceSnap.exists) {
      console.warn(`[Payment Notifications] Invoice ID ${invoiceId} not found.`);
      return;
    }
    const invoice = invoiceSnap.data();

    // 2. Fetch Customer Details
    const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
    if (!customerSnap.exists) {
      console.warn(`[Payment Notifications] Customer ID ${invoice.customerId} not found.`);
      return;
    }
    const customer = customerSnap.data();

    // 3. Fetch Company details
    const companySnap = await adminDb.collection("settings").doc("company").get();
    const company = companySnap.exists ? companySnap.data() : {};

    // 4. Fetch SMTP settings
    const smtpSnap = await adminDb.collection("settings").doc("smtp").get();
    const smtpConfig = smtpSnap.exists ? smtpSnap.data() : {};

    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: invoice.currency || "CAD",
    }).format(invoice.total) + ` ${invoice.currency || "CAD"}`;

    const formattedPaidDate = new Date(paidAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const payUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/${invoice.token}`;

    // A. Send Receipt Email to Customer
    const customerSubject = `Thank you for your payment: Invoice ${invoice.invoiceNumber}`;
    const customerHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
        <div style="background-color: #10B981; color: #FFFFFF; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 22px;">Payment Received!</h1>
          <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Thank you for your partnership</p>
        </div>
        <div style="padding: 30px; color: #1A1A2E; line-height: 1.6; font-size: 14px;">
          <p>Dear ${customer.firstName} ${customer.lastName},</p>
          <p>We've successfully received your payment of <strong>${formattedAmount}</strong> for invoice <strong>${invoice.invoiceNumber}</strong> on <strong>${formattedPaidDate}</strong>.</p>
          
          <p>We truly appreciate your prompt payment. It is an absolute pleasure working with you, and your support helps us continue delivering high-quality marketing and services. Thank you for choosing <strong>${company.companyName || "Elevate Marketing Group"}</strong> as your partner!</p>

          <div style="background-color: #F5F6FA; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #E5E7EB;">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="color: #6B7280; padding: 4px 0;">Invoice #:</td>
                <td style="font-weight: bold; text-align: right;">${invoice.invoiceNumber}</td>
              </tr>
              <tr>
                <td style="color: #6B7280; padding: 4px 0;">Paid On:</td>
                <td style="font-weight: bold; text-align: right;">${formattedPaidDate}</td>
              </tr>
              <tr style="border-top: 1px solid #E5E7EB; font-size: 15px;">
                <td style="color: #10B981; font-weight: bold; padding: 10px 0 0 0;">Amount Paid:</td>
                <td style="color: #10B981; font-weight: bold; text-align: right; padding: 10px 0 0 0;">${formattedAmount}</td>
              </tr>
            </table>
          </div>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${payUrl}" style="background-color: #FE1D66; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(254, 29, 102, 0.25);">
              View Invoice & Receipt
            </a>
          </p>
          
          <p>If you need to download a printable PDF copy of this receipt for your accounting files, you can access it anytime using the link above.</p>
          <p>Thank you again, and we look forward to our continued collaboration!</p>
          <br/>
          <p>Best regards,</p>
          <p><strong>The Team at ${company.companyName || "Elevate Marketing Group"}</strong></p>
        </div>
        <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; font-size: 11px; color: #6B7280; text-align: center;">
          Sent securely by Elevate TM Invoicing on behalf of ${company.companyName || "Elevate TM Invoicing"}.
        </div>
      </div>
    `;

    console.log(`[Payment success] Sending receipt email to customer: ${customer.email}`);
    await sendEmail({
      to: customer.email,
      subject: customerSubject,
      html: customerHtml,
      smtpConfig,
      company,
    });

    // B. Send Notification Email to Admin (Company Email)
    if (company.email) {
      const adminSubject = `[Payment Received] Invoice ${invoice.invoiceNumber} — ${formattedAmount} paid`;
      const adminHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
          <div style="background-color: #2A2A6C; color: #FFFFFF; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 22px;">Payment Received!</h1>
            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Invoice ${invoice.invoiceNumber}</p>
          </div>
          <div style="padding: 30px; color: #1A1A2E; line-height: 1.6; font-size: 14px;">
            <p>Hello Admin,</p>
            <p>Good news! A payment of <strong>${formattedAmount}</strong> has been received and processed for invoice <strong>${invoice.invoiceNumber}</strong>.</p>
            <div style="background-color: #F5F6FA; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #E5E7EB;">
              <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                <tr>
                  <td style="color: #6B7280; padding: 4px 0;">Customer:</td>
                  <td style="font-weight: bold; text-align: right;">${customer.firstName} ${customer.lastName} (${customer.companyName || "N/A"})</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; padding: 4px 0;">Email:</td>
                  <td style="font-weight: bold; text-align: right;">${customer.email}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; padding: 4px 0;">Paid On:</td>
                  <td style="font-weight: bold; text-align: right;">${formattedPaidDate}</td>
                </tr>
                <tr>
                  <td style="color: #6B7280; padding: 4px 0;">Transaction ID:</td>
                  <td style="font-weight: bold; text-align: right; font-family: monospace; font-size: 11px;">${paymentIntentId || "Off-Session Capture"}</td>
                </tr>
              </table>
            </div>
            <p>The invoice status has been updated to <strong>Paid</strong> in the system.</p>
          </div>
          <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; font-size: 11px; color: #6B7280; text-align: center;">
            Elevate TM Invoicing System Notification
          </div>
        </div>
      `;

      console.log(`[Payment success] Sending notification email to Admin: ${company.email}`);
      await sendEmail({
        to: company.email,
        subject: adminSubject,
        html: adminHtml,
        smtpConfig,
        company,
      });
    } else {
      console.log("[Payment success] Company email is not set. Skipping admin notification.");
    }
  } catch (error) {
    console.error("[Payment success] Error sending payment success emails:", error);
    throw error;
  }
}
