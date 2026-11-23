import type { Page, Route } from '@playwright/test';

export const MOCK_UPLOAD_CID =
  'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

export interface ChunkedUploadMockOptions {
  /** Chunks the uploaded file splits into (lib/ipfs.ts uses 1 MB chunks). */
  totalChunks: number;
  /** Abort every chunk from this index on, to simulate a dropped upload. */
  failFromChunk?: number | null;
}

/**
 * Stateful stand-in for the chunked-upload API routes
 * (/api/ipfs/upload/{init,chunk,status,complete}) so specs don't depend on
 * Pinata. Mutate `failFromChunk` / `chunkRequests` between steps as needed.
 */
export function mockChunkedUploadApi(
  page: Page,
  { totalChunks, failFromChunk = null }: ChunkedUploadMockOptions,
) {
  const state = {
    received: new Set<number>(),
    chunkRequests: [] as number[],
    failFromChunk,
  };

  const json = (route: Route, body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  void page.route('**/api/ipfs/upload/init', (route) =>
    json(route, { sessionId: 'e2e-session' }),
  );
  void page.route('**/api/ipfs/upload/chunk', (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const index = Number(/name="chunkIndex"\r\n\r\n(\d+)/.exec(body)?.[1]);
    state.chunkRequests.push(index);
    if (state.failFromChunk !== null && index >= state.failFromChunk) {
      return route.abort('failed');
    }
    state.received.add(index);
    return json(route, {
      receivedChunks: [...state.received].sort((a, b) => a - b),
      totalChunks,
    });
  });
  void page.route('**/api/ipfs/upload/status**', (route) =>
    json(route, {
      receivedChunks: [...state.received].sort((a, b) => a - b),
      totalChunks,
    }),
  );
  void page.route('**/api/ipfs/upload/complete', (route) =>
    state.received.size === totalChunks
      ? json(route, { cid: MOCK_UPLOAD_CID })
      : route.fulfill({ status: 400, body: '{"error":"Incomplete upload"}' }),
  );

  return state;
}
