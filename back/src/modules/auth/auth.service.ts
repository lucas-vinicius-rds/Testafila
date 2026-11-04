import { Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { DatabaseService } from '../../infra/database/database.service.ts';

export function createAuth(db: DatabaseService, options: { allowProvisioning?: boolean } = {}) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET deve conter pelo menos 32 caracteres.');
  const publicOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  return betterAuth({
    database: db.getRawDatabase(),
    // Navegador e cookies usam a origem pública do Next; /api/auth é encaminhado ao Nest.
    baseURL: process.env.BETTER_AUTH_URL ?? publicOrigin,
    trustedOrigins: [publicOrigin],
    emailAndPassword: { enabled: true, disableSignUp: !options.allowProvisioning, requireEmailVerification: false },
    plugins: [admin()],
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    advanced: { useSecureCookies: process.env.NODE_ENV === 'production' },
  });
}

@Injectable()
export class AuthService {
  readonly instance: ReturnType<typeof createAuth>;

  constructor(db: DatabaseService) {
    this.instance = createAuth(db);
  }
}
