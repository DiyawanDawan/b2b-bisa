import nodemailer from 'nodemailer';
import { SendMailClient } from 'zeptomail';
import logger from '#utils/logger.util';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import AppError from '#utils/appError';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  EMAIL_SMTP_HOST,
  EMAIL_SMTP_PASS,
  EMAIL_SMTP_PORT,
  EMAIL_SMTP_SECURE,
  EMAIL_SMTP_USER,
  EMAIL_FROM,
  EMAIL_SENDER_NAME,
  ZEPTOMAIL_TOKEN,
  ZEPTOMAIL_URL,
  ZEPTOMAIL_FROM_ADDRESS,
  CLIENT_HOST,
  NODE_ENV,
} from '#utils/env.util';

const HAS_ZEPTO = !!ZEPTOMAIL_TOKEN.trim();
const HAS_SMTP = !!(EMAIL_SMTP_HOST && EMAIL_SMTP_USER && EMAIL_SMTP_PASS);

const resolvedFromAddress = (): string => {
  if (HAS_ZEPTO) {
    const from = (ZEPTOMAIL_FROM_ADDRESS || EMAIL_FROM || '').trim();
    return from || 'noreply@bisaagri.com';
  }
  const from = (EMAIL_FROM || '').trim();
  const smtpUser = (EMAIL_SMTP_USER || '').trim();
  if (from && from !== 'noreply@bisa.id') return from;
  if (smtpUser) return smtpUser;
  return from || 'noreply@bisaagri.com';
};

if (HAS_ZEPTO) {
  logger.info('Email provider: ZeptoMail', {
    url: ZEPTOMAIL_URL,
    from: resolvedFromAddress(),
    env: NODE_ENV,
  });
} else if (HAS_SMTP) {
  logger.info('Email provider: SMTP (legacy)', {
    host: EMAIL_SMTP_HOST,
    port: EMAIL_SMTP_PORT,
    secure: EMAIL_SMTP_SECURE,
    user: EMAIL_SMTP_USER,
    from: resolvedFromAddress(),
    env: NODE_ENV,
  });
} else {
  logger.error(
    'No email provider configured: set ZEPTOMAIL_TOKEN (preferred) or EMAIL_SMTP_*. OTP emails will fail.',
  );
}

const zeptoClient = HAS_ZEPTO
  ? new SendMailClient({ url: ZEPTOMAIL_URL, token: ZEPTOMAIL_TOKEN.trim() })
  : null;

const transporter = HAS_SMTP
  ? nodemailer.createTransport({
      host: EMAIL_SMTP_HOST,
      port: EMAIL_SMTP_PORT,
      secure: EMAIL_SMTP_SECURE,
      auth: {
        user: EMAIL_SMTP_USER,
        pass: EMAIL_SMTP_PASS,
      },
      ...(EMAIL_SMTP_SECURE ? {} : { requireTLS: true }),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  : null;

/** Public status for /health — never includes secrets. */
export const getSmtpStatus = () => {
  const configured = HAS_ZEPTO || HAS_SMTP;
  return {
    configured,
    provider: HAS_ZEPTO ? 'zeptomail' : HAS_SMTP ? 'smtp' : 'none',
    host: HAS_ZEPTO ? 'api.zeptomail.com' : HAS_SMTP ? EMAIL_SMTP_HOST : null,
    port: HAS_ZEPTO ? null : HAS_SMTP ? EMAIL_SMTP_PORT : null,
    secure: HAS_ZEPTO ? true : EMAIL_SMTP_SECURE,
    from: configured ? resolvedFromAddress() : null,
  };
};

async function sendZeptoMail(to: string, toName: string, subject: string, html: string) {
  if (!zeptoClient) throw new Error('ZeptoMail client not configured');

  const result = await zeptoClient.sendMail({
    from: {
      address: resolvedFromAddress(),
      name: EMAIL_SENDER_NAME || 'BISA Platform',
    },
    to: [
      {
        email_address: {
          address: to,
          name: toName || to,
        },
      },
    ],
    subject,
    htmlbody: html,
  });

  return {
    success: true,
    method: 'zeptomail',
    data: result,
  };
}

async function sendSMTP(from: string, to: string, subject: string, html: string) {
  if (!transporter) throw new Error('SMTP transporter not configured');

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
  toName = '',
) => {
  const fromAddress = from || `"${EMAIL_SENDER_NAME}" <${resolvedFromAddress()}>`;
  try {
    if (HAS_ZEPTO) {
      return await sendZeptoMail(to, toName, subject, html);
    }
    if (HAS_SMTP) {
      return await sendSMTP(fromAddress, to, subject, html);
    }
    throw new Error('No email service configured (ZEPTOMAIL_TOKEN or EMAIL_SMTP_*)');
  } catch (_err: any) {
    const zeptoDetail =
      _err?.error?.message ||
      _err?.response?.data?.message ||
      _err?.message ||
      String(_err);
    logger.error('Failed to send email:', {
      error: zeptoDetail,
      to,
      subject,
      from: fromAddress,
      provider: HAS_ZEPTO ? 'zeptomail' : HAS_SMTP ? 'smtp' : 'none',
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

export const sendWelcomeEmail = async (user: { email: string; fullName: string }) => {
  try {
    const html = await renderMailHtml('welcome', { user, clientHost: CLIENT_HOST });
    return sendMail(user.email, 'Selamat Datang di BISA Platform! 🛡️', html, null, user.fullName);
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
    return await sendMail(email, 'Permintaan Reset Password 🔑', html, null, fullName);
  } catch (error) {
    logger.error('sendPasswordResetEmail failed:', error);
    throw error;
  }
};

export const sendOtpEmail = async (email: string, fullName: string, code: string) => {
  try {
    const html = await renderMailHtml('otp', { code, fullName });
    return await sendMail(email, 'Kode Verifikasi Akun 🛡️', html, null, fullName);
  } catch (error) {
    logger.error('sendOtpEmail failed:', error);
    throw error;
  }
};

/**
 * Send OTP / reset mail and surface failures to the HTTP layer.
 * Prefer this over fire-and-forget: mobile was showing "OTP terkirim" while SMTP failed.
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
