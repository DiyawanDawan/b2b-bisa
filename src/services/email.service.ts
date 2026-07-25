import nodemailer from 'nodemailer';
import logger from '#utils/logger.util';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import AppError from '#utils/appError';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import config
import {
  EMAIL_SMTP_HOST,
  EMAIL_SMTP_PASS,
  EMAIL_SMTP_PORT,
  EMAIL_SMTP_SECURE,
  EMAIL_SMTP_USER,
  EMAIL_FROM,
  EMAIL_SENDER_NAME,
  CLIENT_HOST,
  NODE_ENV,
} from '#utils/env.util';

const HAS_SMTP = !!(EMAIL_SMTP_HOST && EMAIL_SMTP_USER && EMAIL_SMTP_PASS);

/** Gmail (and most SMTP providers) reject From that doesn't match the authenticated user. */
const resolvedFromAddress = (): string => {
  const from = (EMAIL_FROM || '').trim();
  const smtpUser = (EMAIL_SMTP_USER || '').trim();
  if (from && from !== 'noreply@bisa.id') return from;
  if (smtpUser) return smtpUser;
  return from || 'noreply@bisa.id';
};

if (!HAS_SMTP) {
  logger.error(
    'SMTP not configured: set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASS (and preferably EMAIL_FROM). OTP emails will fail.',
  );
} else {
  logger.info('SMTP configured', {
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_SECURE,
    user: EMAIL_SMTP_USER,
    from: resolvedFromAddress(),
    env: NODE_ENV,
  });
}

const transporter = nodemailer.createTransport({
  host: EMAIL_SMTP_HOST,
  port: EMAIL_SMTP_PORT,
  secure: EMAIL_SMTP_SECURE,
  auth: {
    user: EMAIL_SMTP_USER,
    pass: EMAIL_SMTP_PASS,
  },
  // STARTTLS (587): requireTLS helps. Implicit TLS (465): secure=true is enough;
  // requireTLS can confuse some providers, so only enable it for non-secure ports.
  ...(EMAIL_SMTP_SECURE ? {} : { requireTLS: true }),
  // Nodemailer defaults (connect 2m / socket 10m) outlast the mobile client's
  // 30s HTTP timeout, turning a slow SMTP hop into "permintaan waktu habis".
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

/** Public status for /health — never includes secrets. */
export const getSmtpStatus = () => ({
  configured: HAS_SMTP,
  host: HAS_SMTP ? EMAIL_SMTP_HOST : null,
  port: HAS_SMTP ? EMAIL_SMTP_PORT : null,
  secure: EMAIL_SMTP_SECURE,
  from: HAS_SMTP ? resolvedFromAddress() : null,
});

async function sendSMTP(from: string, to: string, subject: string, html: string) {
  try {
    const result = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    return {
      success: true,
      method: 'smtp',
      messageId: result.messageId,
      data: result,
    };
  } catch (error: any) {
    logger.error('SMTP failed:', error.message);
    throw error;
  }
}

export const sendMail = async (
  to: string,
  subject: string,
  html: string,
  from: string | null = null,
) => {
  const fromAddress = from || `"${EMAIL_SENDER_NAME}" <${resolvedFromAddress()}>`;
  try {
    if (HAS_SMTP) {
      return await sendSMTP(fromAddress, to, subject, html);
    } else {
      throw new Error(
        'No email service configured (EMAIL_SMTP_HOST / EMAIL_SMTP_USER / EMAIL_SMTP_PASS)',
      );
    }
  } catch (_err: any) {
    logger.error('Failed to send email:', {
      error: _err.message,
      to,
      subject,
      from: fromAddress,
      smtpConfigured: HAS_SMTP,
    });
    throw new AppError('Gagal mengirim email OTP. Silakan coba lagi.', 502);
  }
};

export const renderMailHtml = async (template: string, data: any) => {
  try {
    const content = await ejs.renderFile(path.join(__dirname, `templates/${template}.ejs`), data, {
      cache: false,
    });
    return content;
  } catch (_err: any) {
    logger.error('Template render error:', _err);
    throw new AppError('Gagal merender email template', 500);
  }
};

// Compatibility wrappers for existing calls
export const sendWelcomeEmail = async (user: { email: string; fullName: string }) => {
  try {
    const html = await renderMailHtml('welcome', { user, clientHost: CLIENT_HOST });
    return sendMail(user.email, 'Selamat Datang di BISA Platform! 🛡️', html);
  } catch (error) {
    logger.error('sendWelcomeEmail failed:', error);
  }
};

export const sendBookingConfirmation = async (email: string, booking: any) => {
  try {
    const html = await renderMailHtml('booking_confirmation', { booking });
    return sendMail(email, `Konfirmasi Pesanan #${booking.id.substring(0, 8)}`, html);
  } catch (error) {
    logger.error('sendBookingConfirmation failed:', error);
  }
};

export const sendPasswordResetEmail = async (email: string, fullName: string, code: string) => {
  try {
    const html = await renderMailHtml('reset_password', { fullName, code });
    return await sendMail(email, 'Permintaan Reset Password 🔑', html);
  } catch (error) {
    logger.error('sendPasswordResetEmail failed:', error);
    throw error;
  }
};

export const sendOtpEmail = async (email: string, fullName: string, code: string) => {
  try {
    const html = await renderMailHtml('otp', { code, fullName });
    return await sendMail(email, 'Kode Verifikasi Akun 🛡️', html);
  } catch (error) {
    logger.error('sendOtpEmail failed:', error);
    throw error;
  }
};

/**
 * Send OTP / reset mail and surface failures to the HTTP layer.
 * Prefer this over fire-and-forget: mobile was showing "OTP terkirim" while SMTP failed.
 * Timeouts on the transporter keep this under ~15s (below typical gateway/client limits).
 * OTP should already be persisted before calling so a failed send can still be recovered from DB / resend.
 */
export const deliverOtpEmail = async (email: string, fullName: string, code: string) => {
  await sendOtpEmail(email, fullName, code);
};

export const deliverPasswordResetEmail = async (email: string, fullName: string, code: string) => {
  await sendPasswordResetEmail(email, fullName, code);
};

/**
 * @deprecated Prefer deliverOtpEmail — kept for non-auth callers that must not block.
 * Failures are logged only; HTTP already returned success.
 */
export const queueOtpEmail = (email: string, fullName: string, code: string) => {
  void sendOtpEmail(email, fullName, code).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('queueOtpEmail failed (OTP already persisted):', { error: message, email });
  });
};

/** @deprecated Prefer deliverPasswordResetEmail */
export const queuePasswordResetEmail = (email: string, fullName: string, code: string) => {
  void sendPasswordResetEmail(email, fullName, code).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('queuePasswordResetEmail failed (OTP already persisted):', {
      error: message,
      email,
    });
  });
};
