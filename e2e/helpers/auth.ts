import { SignJWT } from 'jose';
import type { BrowserContext } from '@playwright/test';
import { JWT_SECRET } from './config';

const secret = new TextEncoder().encode(JWT_SECRET);

/**
 * Signs a JWT matching the API's token format and injects it as
 * an httpOnly cookie on the Playwright browser context.
 */
export async function authenticateAs(
  context: BrowserContext,
  user: { userId: number; orgId: number; role: 'owner' | 'member'; isAdmin: boolean },
) {
  const token = await new SignJWT({
    org_id: user.orgId,
    role: user.role,
    isAdmin: user.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.userId))
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);

  await context.addCookies([
    {
      name: 'access_token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return token;
}
