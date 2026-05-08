import { proxyGet, proxyPut } from '@/lib/bff-proxy';

export const GET = proxyGet('/preferences/email/digest');
export const PUT = proxyPut('/preferences/email/digest');
