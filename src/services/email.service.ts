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
} from '#utils/env.util';

const HAS_SMTP = !!(EMAIL_SMTP_HOST && EMAIL_SMTP_USER && EMAIL_SMTP_PASS);

const transporter = nodemailer.createTransport({
  host: EMAIL_SMTP_HOST,
  port: EMAIL_SMTP_PORT,
  secure: EMAIL_SMTP_SECURE,
  auth: {
    user: EMAIL_SMTP_USER,
    pass: EMAIL_SMTP_PASS,
  },
  requireTLS: true,
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
  const fromAddress = from || `"${EMAIL_SENDER_NAME}" <${EMAIL_FROM}>`;
  try {
    if (HAS_SMTP) {
      return await sendSMTP(fromAddress, to, subject, html);
    } else {
      throw new Error('No email service configured');
    }
  } catch (_err: any) {
    logger.error('Failed to send email:', { error: _err.message, to, subject });
    throw new AppError('Gagal mengirim email', 500);
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
    return sendMail(email, 'Permintaan Reset Password 🔑', html);
  } catch (error) {
    logger.error('sendPasswordResetEmail failed:', error);
  }
};

export const sendOtpEmail = async (email: string, fullName: string, code: string) => {
  try {
    const html = await renderMailHtml('otp', { code, fullName });
    return sendMail(email, 'Kode Verifikasi Akun 🛡️', html);
  } catch (error) {
    logger.error('sendOtpEmail failed:', error);
  }
};
