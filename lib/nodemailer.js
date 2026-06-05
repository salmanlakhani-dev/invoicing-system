// Ensure this utility is never bundled into client-side components
import "server-only";
import nodemailer from "nodemailer";

/**
 * Creates a Nodemailer transporter based on SMTP settings.
 * @param {Object} smtpConfig - SMTP configuration from Firestore settings/smtp
 * @returns {import('nodemailer').Transporter}
 */
export const createTransporter = (smtpConfig = {}) => {
  const host = smtpConfig.host || process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io";
  const port = parseInt(smtpConfig.port || process.env.SMTP_PORT || "2525", 10);
  const user = smtpConfig.username || process.env.SMTP_USER || "";
  const pass = smtpConfig.encryptedPassword 
    ? decryptPassword(smtpConfig.encryptedPassword) 
    : process.env.SMTP_PASS || "";

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

/**
 * Simple decryption placeholder (Base64) for SMTP passwords.
 * In production, this can be upgraded to AES-256 decryption.
 */
export const decryptPassword = (encryptedPassword) => {
  if (!encryptedPassword) return "";
  try {
    return Buffer.from(encryptedPassword, 'base64').toString('utf-8');
  } catch (e) {
    return encryptedPassword;
  }
};

/**
 * Simple encryption placeholder (Base64) for SMTP passwords.
 */
export const encryptPassword = (password) => {
  if (!password) return "";
  return Buffer.from(password).toString('base64');
};
