import { NextRequest } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';
import { privateJson } from '@/lib/httpResponses';

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const overview = await api.get('/referrals/overview').then((r) => r.data);
  return privateJson(overview);
}
