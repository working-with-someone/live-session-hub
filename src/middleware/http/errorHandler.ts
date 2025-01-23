import { wwsError } from '../../error/wwsError';
import { Request, Response, NextFunction } from 'express';
import { errorLogger } from '../logger/winston';
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

    errorLogger.log('error', originError.message, { stack: originError.stack });
  }

  return res.status(err.status).json({
    status: err.status,
    message: err.message,
  });
};

export default errorHandler;
