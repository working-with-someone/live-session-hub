import { Event, Socket } from "socket.io"
import WS_CHANNELS from "../../../constants/channels"
import { liveSessionStatus } from "../../../enums/session"
import { wwsError } from "../../../error/wwsError"
import httpStatusCodes from "http-status-codes"

const checkLiveSessionIsOpenedOrForbidden = (
  socket: Socket
) => ([eventName, ...args]: Event, next: (err?: Error) => void) => {
  // broadcast chat인데
  if (eventName == WS_CHANNELS.chat.broadCastSend) {
    // live session이 open되어있지 않으면 
    if (socket.liveSession.status !== liveSessionStatus.opened) {
      return next(new wwsError(httpStatusCodes.FORBIDDEN))
    }
  }

  return next();
}

const chatMiddleware = {
  checkLiveSessionIsOpenedOrForbidden
}

export default chatMiddleware

