import "server-only";

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
