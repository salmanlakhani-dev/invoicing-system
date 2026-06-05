import { NextResponse } from "next/server";
import { createTransporter } from "@/lib/nodemailer";

/**
 * Route handler to verify SMTP configurations by sending a diagnostic test email.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { smtpConfig, testRecipient } = body;

    if (!testRecipient) {
      return NextResponse.json(
        { success: false, error: "Recipient email is required" },
        { status: 400 }
      );
    }

    const transporter = createTransporter(smtpConfig);

    // Verify transporter connection
    await transporter.verify();

    const fromName = smtpConfig.fromName || "InvoiceFlow Test";
    const fromEmail = smtpConfig.fromEmail || "no-reply@invoiceflow.local";

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: testRecipient,
      subject: "🧾 InvoiceFlow SMTP Connection Test",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
          <div style="background-color: #2A2A6C; color: #FFFFFF; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; font-weight: bold; font-size: 18px;">
            InvoiceFlow Mailer Test
          </div>
          <div style="padding: 20px; color: #1A1A2E; line-height: 1.5;">
            <p>Hello,</p>
            <p>Your SMTP mail configurations were tested successfully! InvoiceFlow is now configured to send emails using your custom credentials.</p>
            <div style="background-color: #F5F6FA; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #E5E7EB; font-size: 13px;">
              <strong>Tested Configuration:</strong><br/>
              SMTP Host: <code>${smtpConfig.host}</code><br/>
              SMTP Port: <code>${smtpConfig.port}</code><br/>
              SMTP Username: <code>${smtpConfig.username}</code><br/>
              Sender: <code>${fromName} &lt;${fromEmail}&gt;</code>
            </div>
            <p>If you did not initiate this test, please review your dashboard security settings immediately.</p>
          </div>
          <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; font-size: 11px; color: #6B7280; text-align: center;">
            Sent automatically by InvoiceFlow SMTP Diagnostic Panel.
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${testRecipient}`,
    });
  } catch (err) {
    console.error("SMTP Test Failure:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to establish SMTP connection",
      },
      { status: 500 }
    );
  }
}
