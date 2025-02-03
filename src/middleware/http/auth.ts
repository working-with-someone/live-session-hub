import { Request, Response, NextFunction } from 'express';
import httpStatusCode from 'http-status-codes';
import { wwsError } from '../../error/wwsError';
import prismaClient from '../../database/clients/prisma';

const httpAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session.userId) {
    const user = await prismaClient.user.findUnique({
      where: {
        id: req.session.userId,
      },
      include: {
        email_verification: true,
      },
    });

    if (user?.email_verification?.email_verified) {
      return next();
    }
  }

  return next(
    new wwsError(
      httpStatusCode.UNAUTHORIZED,
      httpStatusCode.getStatusText(httpStatusCode.UNAUTHORIZED)
    )
  );
};

export default httpAuthMiddleware;
