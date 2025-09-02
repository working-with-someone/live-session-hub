import { Namespace, Socket, socketWithLiveSession } from 'socket.io';
import WS_CHANNELS from '../constants/channels';
import { ResponseCb } from '../@types/augmentation/socket/response';
import httpStatusCode from 'http-status-codes';
import { OrganizerLiveSession } from '../lib/liveSession/live-session';

const registerTransitionHandler = (
  nsp: Namespace,
  socket: socketWithLiveSession<OrganizerLiveSession>
) => {
  const ready = (cb: ResponseCb) => {
    socket.liveSession
      .ready()
      .then(() => {
        socket.nsp.emit(WS_CHANNELS.transition.broadCast.ready);
        cb({ status: httpStatusCode.OK });
      })
      .catch((err) => {
        cb({ status: httpStatusCode.BAD_REQUEST, message: err.message });
      });
  };

  // naming은 break가 reserved 라서
  const opened = (cb: ResponseCb) => {
    socket.liveSession
      .open()
      .then(() => {
        socket.nsp.emit(WS_CHANNELS.transition.broadCast.open);
        cb({ status: httpStatusCode.OK });
      })
      .catch((err) => {
        cb({ status: httpStatusCode.BAD_REQUEST, message: err.message });
      });
  };

  const breaked = (cb: ResponseCb) => {
    socket.liveSession
      .break()
      .then(() => {
        socket.nsp.emit(WS_CHANNELS.transition.broadCast.break);
        cb({ status: httpStatusCode.OK });
      })
      .catch((err) => {
        cb({ status: httpStatusCode.BAD_REQUEST, message: err.message });
      });
  };

  const closed = (cb: ResponseCb) => {
    socket.liveSession
      .close()
      .then(() => {
        socket.nsp.emit(WS_CHANNELS.transition.broadCast.close);
        cb({ status: httpStatusCode.OK });
      })
      .catch((err) => {
        cb({ status: httpStatusCode.BAD_REQUEST, message: err.message });
      });
  };

  socket.on(WS_CHANNELS.transition.ready, ready);
  socket.on(WS_CHANNELS.transition.open, opened);
  socket.on(WS_CHANNELS.transition.break, breaked);
  socket.on(WS_CHANNELS.transition.close, closed);
};

export default registerTransitionHandler;
