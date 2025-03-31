import { Namespace, Socket } from "socket.io";
import WS_CHANNELS from "../constants/channels";
import { ResponseCb } from "../@types/augmentation/socket/response";
import httpStatusCode from "http-status-codes";

const registerTransitionHandler = (nsp: Namespace, socket: Socket) => {
  // naming은 break가 reserved 라서
  const opened = (cb: ResponseCb) => {
    nsp.emit(WS_CHANNELS.transition.broadCast.open)

    cb({ status: httpStatusCode.OK })
  }

  const breaked = (cb: ResponseCb) => {
    nsp.emit(WS_CHANNELS.transition.broadCast.break)

    cb({ status: httpStatusCode.OK })
  }

  socket.on(WS_CHANNELS.transition.open, opened);
  socket.on(WS_CHANNELS.transition.break, breaked)
}

export default registerTransitionHandler