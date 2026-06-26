import express, { Request, Response } from 'express';
import { getLastLedgerInfo } from './ledgerTracker';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const startTime = Date.now();

app.get('/health', (req: Request, res: Response) => {
  const { lastLedger, timestamp } = getLastLedgerInfo();
  const now = Date.now();
  const stale = now - timestamp > 60_000; // 60 seconds
  if (stale) {
    res.status(200).json({ status: 'degraded' });
  } else {
    const uptimeSec = Math.floor((now - startTime) / 1000);
    res.status(200).json({ status: 'ok', lastLedger, uptime: uptimeSec });
  }
});

export function startServer() {
  app.listen(PORT, () => {
    console.log(`Indexer health server listening on port ${PORT}`);
  });
}
