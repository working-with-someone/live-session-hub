import prismaClient from '../../src/database/clients/prisma';
import ioc from 'socket.io-client';
import { Socket as ClientSocket } from 'socket.io-client';
import currUser from '../data/curr-user';
import { httpServer } from '../../src/http';
import {
  LiveSessionField,
  LiveSessionWithAll,
} from '../../src/@types/liveSession';
import liveSessionFactory from '../factories/live-session-factory';
import { access_level, live_session_status } from '@prisma/client';
import { Role } from '../../src/enums/session';
import fs from 'node:fs';
import WS_CHANNELS from '../../src/constants/channels';
import { wwsError } from '../../src/error/wwsError';
import httpStatusCode from 'http-status-codes';
import liveSessionPool from '../../src/lib/liveSession/pool';

describe('Stream', () => {
  beforeAll(async () => {
    await currUser.insert();
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  afterAll(async () => {
    await liveSessionPool.clear();
    await currUser.delete();
  });

  describe('Streaming_To_Opened_Live_Session', () => {
    const organizer = currUser;
    let organizerSocket: ClientSocket;
    let openedLiveSession: LiveSessionWithAll;

    beforeEach(async () => {
      openedLiveSession = await liveSessionFactory.createAndSave({
        access_level: access_level.PUBLIC,
        status: live_session_status.OPENED,
        organizer: {
          connect: { id: organizer.id },
        },
      });
    });

    beforeEach((done) => {
      organizerSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${openedLiveSession.id}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
        }
      );

      organizerSocket.on('connect', () => {
        done();
      });
    });

    afterEach(async () => {
      await liveSessionFactory.cleanup();
    });

    afterEach((done) => {
      if (organizerSocket.connected) {
        organizerSocket.disconnect();

        done();
      }
    });

    // 여기서 200은 ffmpeg process에 data를 입력하는 것이 성공했음을 의미하는 200이다. 이후 ffmpeg가 성공적으로 수행되었는지는 판단할 수 없다.
    test('Response_200_And_Live_Session_Status_Must_Not_Be_Updated', (done) => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');

      // callback이 호출되면 검증 수행
      const cb = jest.fn((resp) => {
        // callback이 호출되었는지 확인
        expect(cb).toHaveBeenCalledTimes(1);

        // 응답 상태 확인
        expect(resp.status).toBe(200);

        setTimeout(() => {
          prismaClient.live_session
            .findFirst({
              where: { id: openedLiveSession.id },
            })
            .then((liveSession) => {
              if (liveSession?.status === live_session_status.OPENED) {
                done();
              } else {
                done(
                  new Error(`live session translated to ${liveSession?.status}`)
                );
              }
            })
            .catch((err) => {
              done(err);
            });
        }, 1000);
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, cb);
    });

    test('WS_Stream_Error_Channel_Must_Not_Be_Emitted', (done) => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');
      const errorCb = jest.fn((line) => {
        done(new Error(`Error Channel Emitted ${line}`));
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, () => {});
      organizerSocket.on(WS_CHANNELS.stream.error, errorCb);

      setTimeout(() => {
        expect(errorCb).not.toHaveBeenCalled();
        done();
      }, 1000);
    });
  });

  describe('Streaming_To_Ready_Live_Session', () => {
    const organizer = currUser;
    let organizerSocket: ClientSocket;
    let readyLiveSession: LiveSessionWithAll;

    beforeEach(async () => {
      readyLiveSession = await liveSessionFactory.createAndSave({
        access_level: access_level.PUBLIC,
        status: live_session_status.READY,
        organizer: {
          connect: { id: organizer.id },
        },
      });
    });

    beforeEach((done) => {
      organizerSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${readyLiveSession.id}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
        }
      );

      organizerSocket.on('connect', () => {
        done();
      });
    });

    afterEach((done) => {
      if (organizerSocket.connected) {
        organizerSocket.disconnect();

        done();
      }
    });

    afterEach(async () => {
      liveSessionFactory.cleanup();
    });

    // ready상태인
    test('Response_200_And_Live_Session_Status_Must_Be_Updated_To_Opened', (done) => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');

      const cb = jest.fn((resp) => {
        // callback이 호출되었는지 확인
        expect(cb).toHaveBeenCalledTimes(1);

        // 응답 상태 확인
        expect(resp.status).toBe(200);

        setTimeout(() => {
          prismaClient.live_session
            .findFirst({
              where: { id: readyLiveSession.id },
            })
            .then((liveSession) => {
              if (liveSession?.status === live_session_status.OPENED) {
                done();
              } else {
                done(
                  new Error(`live session translated to ${liveSession?.status}`)
                );
              }
            })
            .catch((err) => {
              done(err);
            });
        }, 1000);
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, cb);
    });

    test('Started_At_Must_Be_Updated_When_First_Media_Pushed', async () => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');

      const cb = jest.fn();

      organizerSocket.on(
        WS_CHANNELS.livesession.update,
        async (field: LiveSessionField) => {
          const liveSession = await prismaClient.live_session.findFirst({
            where: { id: readyLiveSession.id },
          });

          expect(liveSession?.started_at).toBeDefined();
        }
      );
      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, cb);
    });

    test('WS_Stream_Error_Channel_Must_Not_Be_Emitted', (done) => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');
      const errorCb = jest.fn((line) => {
        done(new Error(`Error Channel Emitted ${line}`));
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, () => {});
      organizerSocket.on(WS_CHANNELS.stream.error, errorCb);

      setTimeout(() => {
        expect(errorCb).not.toHaveBeenCalled();
        done();
      }, 2000);
    });
  });

  describe('Streaming_To_Breaked_Live_Session', () => {
    const organizer = currUser;
    let organizerSocket: ClientSocket;
    let breakedLiveSession: LiveSessionWithAll;

    beforeAll(async () => {
      breakedLiveSession = await liveSessionFactory.createAndSave({
        access_level: access_level.PUBLIC,
        status: live_session_status.BREAKED,
        organizer: {
          connect: { id: organizer.id },
        },
      });
    });

    beforeEach((done) => {
      organizerSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${breakedLiveSession.id}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
        }
      );

      organizerSocket.on('connect', () => {
        done();
      });
    });

    afterEach((done) => {
      if (organizerSocket.connected) {
        organizerSocket.disconnect();

        done();
      }
    });

    afterAll(async () => {
      liveSessionFactory.cleanup();
    });

    // ready상태인
    test('Response_200_And_Live_Session_Status_Must_Not_Be_Updated', (done) => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');

      const cb = jest.fn((resp) => {
        // callback이 호출되었는지 확인
        expect(cb).toHaveBeenCalledTimes(1);

        // 응답 상태 확인
        expect(resp.status).toBe(200);

        setTimeout(() => {
          prismaClient.live_session
            .findFirst({
              where: { id: breakedLiveSession.id },
            })
            .then((liveSession) => {
              if (liveSession?.status === live_session_status.BREAKED) {
                done();
              } else {
                done(
                  new Error(`live session translated to ${liveSession?.status}`)
                );
              }
            })
            .catch((err) => {
              done(err);
            });
        }, 1000);
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, cb);
    });

    test('WS_Stream_Error_Channel_Must_Not_Be_Emitted', (done) => {
      const mediaBuffer = fs.readFileSync('tests/video/video.webm');
      const errorCb = jest.fn((line) => {
        done(new Error(`Error Channel Emitted ${line}`));
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, mediaBuffer, () => {});
      organizerSocket.on(WS_CHANNELS.stream.error, (line) => {
        done(new Error(`Error Channel Emitted ${line}`));
      });

      setTimeout(() => {
        expect(errorCb).not.toHaveBeenCalled();
        done();
      }, 2000);
    });
  });

  describe('Streaming_To_Closed_Live_Session', () => {
    const organizer = currUser;
    let closedLiveSession: LiveSessionWithAll;

    beforeAll(async () => {
      closedLiveSession = await liveSessionFactory.createAndSave({
        access_level: access_level.PUBLIC,
        status: live_session_status.CLOSED,
        organizer: {
          connect: { id: organizer.id },
        },
      });
    });

    afterAll(async () => {
      liveSessionFactory.cleanup();
    });

    test('Response_410_When_Connect_To_Closed_Live_Session', (done) => {
      const organizerSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${closedLiveSession.id}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
        }
      );

      organizerSocket.on('connect_error', (err) => {
        expect(err).toEqual(new wwsError(httpStatusCode.GONE));
        done();
      });

      setTimeout(() => {
        if (organizerSocket.connected) {
          done(new Error('organizer can not connect to closed live session'));
        }
      }, 2000);
    });
  });

  describe('Streaming_Invalid_Data', () => {
    const organizer = currUser;
    let organizerSocket: ClientSocket;
    let openedLiveSession: LiveSessionWithAll;

    beforeAll(async () => {
      openedLiveSession = await liveSessionFactory.createAndSave({
        access_level: access_level.PUBLIC,
        status: live_session_status.OPENED,
        organizer: {
          connect: { id: organizer.id },
        },
      });
    });

    beforeEach((done) => {
      organizerSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${openedLiveSession.id}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
        }
      );

      organizerSocket.on('error', (err) => {
        done(err);
      });
      organizerSocket.on('connect', () => {
        done();
      });
    });

    afterEach((done) => {
      if (organizerSocket.connected) {
        organizerSocket.disconnect();

        done();
      }
    });

    afterAll(async () => {
      liveSessionFactory.cleanup();
    });

    test('Emit_Stream_Error_When_Fake_Media_Buffer_Pushed', (done) => {
      const fakeMediaBuffer = Buffer.alloc(128 * 128, 'hello world!');

      const cb = jest.fn((resp) => {
        // callback이 호출되었는지 확인
        expect(cb).toHaveBeenCalledTimes(1);

        // 응답 상태 확인
        expect(resp.status).toBe(200);
      });

      organizerSocket.emit(WS_CHANNELS.stream.push, fakeMediaBuffer, cb);

      organizerSocket.once(WS_CHANNELS.stream.error, () => {
        done();
      });
    });
  });
});
