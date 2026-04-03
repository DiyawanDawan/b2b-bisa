import jwt from 'jsonwebtoken';
import { addDays, addMinutes } from 'date-fns';
import prisma from '#config/prisma';
import { TokenType } from '#prisma';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET di environment (.env) belum dikonfigurasi.');
}

export const generateAccessToken = (userId: string, role: string): string => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
};

export const generateRefreshToken = async (userId: string): Promise<string> => {
  const token = crypto.randomBytes(64).toString('hex');
  // Robust parsing for '30d', '7d', etc.
  const daysMatch = JWT_REFRESH_EXPIRES_IN.match(/^(\d+)d$/);
  const days = daysMatch ? parseInt(daysMatch[1]) : 30;
  await prisma.token.create({
    data: {
      userId,
      token,
      type: TokenType.REFRESH,
      expiresAt: addDays(new Date(), days),
    },
  });
  return token;
};

export const generateOtp = async (userId: string, type: TokenType): Promise<string> => {
  const otp = crypto.randomInt(100000, 999999).toString();
  // Delete old OTPs of same type

  await prisma.token.deleteMany({ where: { userId, type } });
  await prisma.token.create({
    data: {
      userId,
      token: otp,
      type,
      expiresAt: addMinutes(new Date(), 15),
    },
  });
  return otp;
};

export const verifyRefreshToken = async (token: string) => {
  const record = await prisma.token.findFirst({ where: { token } });
  if (!record || record.type !== TokenType.REFRESH || record.expiresAt < new Date()) {
    return null;
  }
  return record;
};

export const revokeRefreshToken = async (token: string) => {
  await prisma.token.deleteMany({ where: { token } });
};

export const verifyOtp = async (userId: string, otp: string, type: TokenType) => {
  const record = await prisma.token.findFirst({ where: { userId, token: otp, type } });
  if (!record || record.expiresAt < new Date()) return false;
  await prisma.token.delete({ where: { id: record.id } });
  return true;
};
