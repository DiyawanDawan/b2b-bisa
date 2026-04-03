import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { errorResponse } from '#utils/response.util';

const validate =
  (schema: ZodSchema, source: 'body' | 'query' | 'params' | 'all' = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (source === 'all') {
        const result = schema.parse({
          body: req.body,
          query: req.query,
          params: req.params,
        });
        // If the schema matches the { body, query, params } pattern, sync back
        if (result.body) req.body = result.body;
        if (result.query) req.query = result.query;
        if (result.params) req.params = result.params;
      } else {
        // Validate specific source and sync back transformed results (important for coercion)
        req[source] = schema.parse(req[source]);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        errorResponse(res, 'Sistem mendeteksi kesalahan input data', 400, errors);
        return;
      }
      next(err);
    }
  };

export default validate;
