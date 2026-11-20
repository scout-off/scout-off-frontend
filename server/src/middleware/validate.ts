import type { RequestHandler, Response } from 'express';
import type { ZodIssue, ZodTypeAny } from 'zod';
import type { ValidationErrorBody } from '../types/api';

/**
 * Schema-based request validation (issue #1714). Parses `req.body`,
 * `req.params` and `req.query` against zod schemas and replaces them with
 * the parsed (trimmed, defaulted) values. Any failure is a 400 in the shared
 * `VALIDATION_FAILED` shape, which the frontend's `parseApiError` maps.
 */

type Part = 'body' | 'params' | 'query';
type Schemas = Partial<Record<Part, ZodTypeAny>>;

export function sendValidationError(
  res: Response,
  details: ValidationErrorBody['error']['details'],
): void {
  const body: ValidationErrorBody = {
    error: { code: 'VALIDATION_FAILED', message: 'Invalid request', details },
  };
  res.status(400).json(body);
}

function toDetail(part: Part, issue: ZodIssue) {
  return { path: [part, ...issue.path].join('.'), message: issue.message };
}

export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const details: ValidationErrorBody['error']['details'] = [];
    const parsed: Partial<Record<Part, unknown>> = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) parsed[part] = result.data;
      else details.push(...result.error.issues.map((i) => toDetail(part, i)));
    }

    if (details.length > 0) return sendValidationError(res, details);

    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params as typeof req.params;
    if ('query' in parsed) req.query = parsed.query as typeof req.query;
    next();
  };
}
