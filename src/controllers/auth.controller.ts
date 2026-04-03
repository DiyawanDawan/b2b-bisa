import * as authService from '#services/auth.service';
import catchAsync from '#utils/catchAsync';
import { successResponse, createdResponse } from '#utils/response.util';
import { AuthRequest } from '#types/index';
import { TokenType } from '#prisma';
import { Response, Request } from 'express';

export const registerSupplier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password, fullName, phone, province, regency } = req.body as {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    province?: string;
    regency?: string;
  };
  const result = await authService.register({
    email,
    password,
    fullName,
    phone,
    province,
    regency,
    role: 'SUPPLIER',
  });
  createdResponse(res, result, 'Supplier berhasil terdaftar. Silakan cek OTP Anda.');
});

export const registerBuyer = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password, fullName, phone, province, regency } = req.body as {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    province?: string;
    regency?: string;
  };
  const result = await authService.register({
    email,
    password,
    fullName,
    phone,
    province,
    regency,
    role: 'BUYER',
  });
  createdResponse(res, result, 'Buyer berhasil terdaftar. Silakan cek OTP Anda.');
});

export const verifyRegistration = catchAsync(async (req: Request, res: Response) => {
  const { email, code } = req.body as { email: string; code: string };
  const result = await authService.verifyRegistration(email, code);
  successResponse(res, result, 'Akun berhasil diverifikasi dan diaktifkan');
});

export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const { user, token } = await authService.loginUser(email, password);
  successResponse(res, { user, token }, 'Login berhasil');
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  const refreshToken = req.body?.refreshToken as string | undefined;
  await authService.logoutUser(req.user!.id, refreshToken);
  successResponse(res, null, 'Logout berhasil');
});

export const refreshToken = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token } = req.body as { token: string };
  const data = await authService.refreshToken(token);
  successResponse(res, data, 'Token berhasil direfresh');
});

export const forgotPassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email } = req.body as { email: string };
  await authService.forgotPassword(email);
  successResponse(res, null, 'Kode reset password telah dikirim ke email Anda');
});

export const verifyResetCode = catchAsync(async (req: Request, res: Response) => {
  const { email, code } = req.body as { email: string; code: string };
  const result = await authService.verifyResetCode(email, code);
  successResponse(res, result, 'Kode berhasil diverifikasi. Silakan ubah password Anda.');
});

export const resetPasswordWithToken = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;
  const { password } = req.body as { password: string };
  await authService.resetPasswordWithToken(token, password);
  successResponse(res, null, 'Password berhasil direset. Silakan login kembali.');
});

export const resetPassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const { password } = req.body as { password: string };
  await authService.resetPassword(req.user!.id, password);
  successResponse(res, null, 'Password berhasil direset');
});

export const loginWithGoogle = catchAsync(async (req: Request, res: Response) => {
  const { token, role } = req.body as { token: string; role?: any };
  const result = await authService.loginWithSocial('google', token, role);
  successResponse(res, result, 'Login dengan Google berhasil');
});

export const loginWithFacebook = catchAsync(async (req: Request, res: Response) => {
  const { token, role } = req.body as { token: string; role?: any };
  const result = await authService.loginWithSocial('facebook', token, role);
  successResponse(res, result, 'Login dengan Facebook berhasil');
});

export const resendOTP = catchAsync(async (req: Request, res: Response) => {
  const { email, type } = req.body as {
    email: string;
    type: TokenType.EMAIL_VERIFICATION | TokenType.RESET_PASSWORD;
  };
  await authService.resendOTP(email, type);
  successResponse(res, null, 'Kode OTP baru telah dikirim');
});
