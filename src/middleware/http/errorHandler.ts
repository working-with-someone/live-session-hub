import { wwsError } from '../../error/wwsError';
import { Request, Response, NextFunction } from 'express';
import httpStatusCode from 'http-status-codes';

const errorHandler = (
  err: wwsError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isUnHandledException = err.originError ? true : false;

  // unhandled exception
  if (isUnHandledException) {
    const originError = err.originError;
  }

  return res.status(err.status).json({
    status: err.status,
    message: err.message,
  });
};

export default errorHandler;
