import { socialLoginSchema } from '../../src/validations/auth.validation';

describe('socialLoginSchema', () => {
  it('accepts token field from mobile client', () => {
    const parsed = socialLoginSchema.parse({ token: 'google-id-token' });
    expect(parsed.token).toBe('google-id-token');
  });

  it('accepts legacy idToken alias', () => {
    const parsed = socialLoginSchema.parse({ idToken: 'legacy-token' });
    expect(parsed.token).toBe('legacy-token');
  });

  it('rejects empty payload', () => {
    expect(() => socialLoginSchema.parse({})).toThrow();
  });
});
