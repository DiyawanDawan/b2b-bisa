import { Request, Response, NextFunction } from 'express';

type AsyncFn = (req: any, res: Response, next: NextFunction) => Promise<unknown>;

const catchAsync = (fn: AsyncFn) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;
