/**
 * One-off: test ZeptoMail send using local .env (not committed).
 * Usage: npx tsx scripts/test-zeptomail.ts
 */
import 'dotenv/config';
import { SendMailClient } from 'zeptomail';

const token = (process.env.ZEPTOMAIL_TOKEN || '').trim();
const url = process.env.ZEPTOMAIL_URL || 'https://api.zeptomail.com/v1.1/email';
const from = process.env.ZEPTOMAIL_FROM_ADDRESS || 'noreply@bisaagri.com';
const to = process.argv[2] || 'bisaagri@gmail.com';

if (!token) {
  console.error('Missing ZEPTOMAIL_TOKEN in .env');
  process.exit(1);
}

const client = new SendMailClient({ url, token });

try {
  const resp = await client.sendMail({
    from: { address: from, name: process.env.EMAIL_SENDER_NAME || 'BISA Platform' },
    to: [{ email_address: { address: to, name: 'BISA' } }],
    subject: 'BISA — Test ZeptoMail OTP channel',
    htmlbody:
      '<div><b>ZeptoMail OK.</b><p>Jika Anda menerima email ini, channel OTP sudah siap.</p></div>',
  });
  console.log('SUCCESS', JSON.stringify(resp));
} catch (err: any) {
  console.error('FAILED', err?.error || err?.message || err);
  process.exit(1);
}
