import {
  generateSpanId,
  generateTraceId,
  getOrCreateTraceContext,
  newTraceContext,
  parseTraceparent,
} from '@/lib/traceContext';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN = '00f067aa0ba902b7';
const headers = (value: string | null) => ({ get: () => value });

describe('traceContext', () => {
  it('generates lowercase hex ids of the right length', () => {
    const traceId = generateTraceId();
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceId).not.toMatch(/^0+$/);
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('parses a valid traceparent and reads the sampled flag from bit 0', () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-01`)).toEqual({
      traceId: TRACE,
      parentSpanId: SPAN,
      sampled: true,
    });
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-00`)?.sampled).toBe(false);
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-03`)?.sampled).toBe(true);
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-02`)?.sampled).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['all-zero trace id', `00-${'0'.repeat(32)}-${SPAN}-01`],
    ['all-zero span id', `00-${TRACE}-${'0'.repeat(16)}-01`],
    ['short trace id', `00-${TRACE.slice(1)}-${SPAN}-01`],
    ['long span id', `00-${TRACE}-${SPAN}0-01`],
    ['uppercase hex', `00-${TRACE.toUpperCase()}-${SPAN}-01`],
    ['version ff', `ff-${TRACE}-${SPAN}-01`],
    ['extra segment', `00-${TRACE}-${SPAN}-01-extra`],
    ['garbage', 'not-a-traceparent'],
  ])('rejects %s', (_label, value) => {
    expect(parseTraceparent(value)).toBeNull();
  });

  it('newTraceContext mints a sampled root context', () => {
    const ctx = newTraceContext();
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.parentSpanId).toMatch(/^[0-9a-f]{16}$/);
    expect(ctx.sampled).toBe(true);
  });

  it('getOrCreateTraceContext reuses a valid incoming header', () => {
    expect(getOrCreateTraceContext(headers(`00-${TRACE}-${SPAN}-00`))).toEqual({
      traceId: TRACE,
      parentSpanId: SPAN,
      sampled: false,
    });
  });

  it('getOrCreateTraceContext mints a new context when absent or invalid', () => {
    for (const value of [null, 'bogus']) {
      const ctx = getOrCreateTraceContext(headers(value));
      expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx.traceId).not.toBe(TRACE);
      expect(ctx.sampled).toBe(true);
    }
  });
});
