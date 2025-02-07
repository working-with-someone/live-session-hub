import testUserData from '../../data/user.json';
import { Request, Response } from 'express';
import { NextFunction } from 'express';
import { Socket } from 'socket.io';

const currUser = testUserData.currUser;

jest.mock('../../../src/middleware/http/auth.ts', () => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.session.userId = currUser.id;

    next();
  };
});

jest.mock('../../../src/middleware/socket/auth.ts', () => {
  return (socket: Socket, next: NextFunction) => {
    socket.userId = currUser.id;
    next();
  };
});
