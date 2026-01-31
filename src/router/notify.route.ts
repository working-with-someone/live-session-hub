import { Request, Response, Router } from 'express';
import liveSessionPool from '../lib/liveSession/pool';
import { liveSessionBreakScheduler } from '../lib/liveSession/schedular/open-break-schedular';
import { live_session_status } from '@prisma/client';
import httpStatusCodes from 'http-status-codes';

type NotifyAction =
  | 'postPlay'
  | 'donePlay'
  | 'postPublish'
  | 'donePublish'
  | 'doneRecord';

interface NotifyBody {
  id: string;
  ip: string;
  app: string;
  name: string;
  query: string;
  protocol: string;
  createtime: number;
  endtime: number;
  inbytes: number;
  outbytes: number;
  filePath: string;
  action: NotifyAction;
}

interface NotifyRequest extends Request {
  body: NotifyBody;
}

const notifyRouter = Router();

notifyRouter.route('/').post(async (req: NotifyRequest, res: Response) => {
  const liveSessionId = req.body.name;
  const liveSession = liveSessionPool.get(liveSessionId);

  if (!liveSession) {
    throw new Error('live session does not exist on pool');
  }

  switch (req.body.action) {
    // media push가 시작되면, live session을 open한다.
    case 'postPublish':
      // open이 불가능한 상태라면 200이 아닌 응답을 보내 media server에서 해당 session을 종료할 수 있도록 한다.
      if (!liveSession.isOpenable()) {
        res.status(httpStatusCodes.BAD_REQUEST).end();

        return;
      }

      // live session을 open한다.
      await liveSession.open();

      break;

    // media push가 종료되면, live session을 종료한다.
    case 'donePublish':
      // live session을 close한다.
      await liveSession.close();

      break;

    // recording이 종료되면, video session을 생성한다.
    case 'doneRecord':
      break;
  }

  res.status(httpStatusCodes.OK).end();

  return;
});

export default notifyRouter;
