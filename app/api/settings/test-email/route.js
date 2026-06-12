import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

/**
 * Route handler to verify SMTP/Resend configurations by sending a diagnostic test email.
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

    const fromName = smtpConfig.fromName || "Elevate TM Invoicing Test";
    const fromEmail = smtpConfig.fromEmail || "no-reply@elevatetm.com";

    const subject = "🧾 Elevate TM Invoicing Email Connection Test";
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 12px; background-color: #FFFFFF;">
        <div style="background-color: #2A2A6C; color: #FFFFFF; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; font-weight: bold; font-size: 18px;">
          Elevate TM Invoicing Mailer Test
        </div>
        <div style="padding: 20px; color: #1A1A2E; line-height: 1.5;">
          <p>Hello,</p>
          <p>Your email configurations were tested successfully! Elevate TM Invoicing is now configured to send emails using your custom credentials.</p>
          <div style="background-color: #F5F6FA; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #E5E7EB; font-size: 13px;">
            <strong>Tested Configuration:</strong><br/>
            Provider: <code>${smtpConfig.provider || "smtp"}</code><br/>
            ${smtpConfig.provider === "resend" ? `
              API Key Configured: <code>Yes</code><br/>
            ` : `
              SMTP Host: <code>${smtpConfig.host || "sandbox.smtp.mailtrap.io"}</code><br/>
              SMTP Port: <code>${smtpConfig.port || "2525"}</code><br/>
              SMTP Username: <code>${smtpConfig.username || "—"}</code><br/>
            `}
            Sender: <code>${fromName} &lt;${fromEmail}&gt;</code>
          </div>
          <p>If you did not initiate this test, please review your dashboard security settings immediately.</p>
        </div>
        <div style="border-top: 1px solid #E5E7EB; padding-top: 15px; font-size: 11px; color: #6B7280; text-align: center;">
          Sent automatically by Elevate TM Invoicing Diagnostic Panel.
        </div>
      </div>
    `;

    await sendEmail({
      to: testRecipient,
      subject,
      html,
      smtpConfig,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${testRecipient}`,
    });
  } catch (err) {
    console.error("Email Configuration Test Failure:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to deliver connection test email",
      },
      { status: 500 }
    );
  }
}
