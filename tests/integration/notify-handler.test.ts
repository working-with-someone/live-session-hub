import request from 'supertest';
import app from '../../src/app';
import httpStatusCodes from 'http-status-codes';
import liveSessionFactory from '../factories/live-session-factory';
import currUser from '../data/curr-user';
import { live_session_status } from '@prisma/client';
import liveSessionPool from '../../src/lib/liveSession/pool';
import { OrganizerLiveSession } from '../../src/lib/liveSession/live-session';
import { liveSessionBreakHeap } from '../../src/lib/liveSession/schedular/open-break-schedular';
import { httpServer } from '../../src/http';

describe('Notify Handler', () => {
  beforeAll(async () => {
    await currUser.insert();
  });

  afterAll(async () => {
    await currUser.delete();
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  afterEach(async () => {
    liveSessionFactory.cleanup();
  });

  describe('post publish notify', () => {
    test('Response_200_With_Ready_Live_Session', async () => {
      const liveSession = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        status: live_session_status.READY,
        break_time: {
          create: {
            interval: 50,
            duration: 10,
          },
        },
      });

      const organizerLiveSession = new OrganizerLiveSession(liveSession);

      await liveSessionPool.add(organizerLiveSession);

      const res = await request(app)
        .post('/notify')
        .set('Content-Type', 'application/json')
        .send({
          id: 'mkpix8f48hwdxvcv',
          ip: '::ffff:172.18.0.5:49750',
          app: 'live',
          name: organizerLiveSession.id,
          query: {},
          protocol: 'rtmp',
          createtime: 1769090694880,
          endtime: 0,
          inbytes: 3497,
          outbytes: 0,
          filePath: '',
          action: 'postPublish',
        });

      expect(res.statusCode).toEqual(httpStatusCodes.OK);

      // live session
      expect(organizerLiveSession.status).toEqual(live_session_status.OPENED);
      // break time을 설정했기 때문에, break time scheduler에 등록되어있어야한다.
      expect(
        liveSessionBreakHeap.contains(organizerLiveSession.id)
      ).toBeTruthy();

      liveSessionBreakHeap.remove(organizerLiveSession.id);
    });

    test('Response_400_With_Opened_Live_Session', async () => {
      const liveSession = await liveSessionFactory.createAndSave({
        organizer: {
          connect: {
            id: currUser.id,
          },
        },
        status: live_session_status.OPENED,
        break_time: {
          create: {
            interval: 50,
            duration: 10,
          },
        },
        started_at: new Date(),
      });

      const organizerLiveSession = new OrganizerLiveSession(liveSession);

      await liveSessionPool.add(organizerLiveSession);

      const res = await request(app)
        .post('/notify')
        .set('Content-Type', 'application/json')
        .send({
          id: 'mkpix8f48hwdxvcv',
          ip: '::ffff:172.18.0.5:49750',
          app: 'live',
          name: organizerLiveSession.id,
          query: {},
          protocol: 'rtmp',
          createtime: 1769090694880,
          endtime: 0,
          inbytes: 3497,
          outbytes: 0,
          filePath: '',
          action: 'postPublish',
        });

      expect(res.statusCode).toEqual(httpStatusCodes.BAD_REQUEST);

      liveSessionBreakHeap.remove(organizerLiveSession.id);
    });
  });
});
