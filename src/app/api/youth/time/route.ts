import { readNetworkClock } from '@/server/network-clock';

export const dynamic = 'force-dynamic';
export async function GET() {
  const started = performance.now();
  const sample = await readNetworkClock();
  return Response.json({ ...sample, processingMs: performance.now() - started, timeZone: 'Asia/Shanghai', precisionMs: 1000 }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
