import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';

jest.mock('../../../src/middleware/socket/auth.ts', () => {
  return (socket: Socket, next: (err?: ExtendedError) => void) => {
    // socket.request.headers의 key는 lowercase다
    if (!socket.request.headers.userid) {
      throw new Error('userid must specify');
    }

    socket.userId = parseInt(socket.request.headers.userid as string);
    next();
  };
});
