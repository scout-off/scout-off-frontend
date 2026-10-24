import { NextResponse } from 'next/server';

import type { ApiErrorBody, ApiErrorCode, ApiErrorParams } from './apiErrorCodes';

// Codes, types and parseApiError live in ./apiErrorCodes so client code can
// use them without pulling next/server into the browser bundle.
export * from './apiErrorCodes';

export function apiError(
  code: ApiErrorCode,
  status: number,
  message: string,
  params?: ApiErrorParams,
  init?: ResponseInit,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, ...(params ? { params } : {}), message } },
    { ...init, status },
  );
}
