import { httpServer } from '../../src/http';
import testUserData from '../data/user.json';
import prismaClient from '../../src/database/clients/prisma';
import WS_CHANNELS from '../../src/constants/channels';
import { Socket as ClientSocket } from 'socket.io-client';
import ioc from 'socket.io-client';
import { live_session_status } from '@prisma/client';
import { access_level } from '@prisma/client';
import liveSessionFactory from '../factories/live-session-factory';
import { LiveSessionWithAll } from '../../src/@types/liveSession';
import { Role } from '../../src/enums/session';
import currUser from '../data/curr-user';

describe('Chat Handler', () => {
  const organizer = currUser;
  const participant1 = testUserData.users[0];
  const participant2 = testUserData.users[1];
  const otherSessionParticipant = testUserData.users[2];

  let breakedLiveSession: LiveSessionWithAll;
  let breakedLiveSession2: LiveSessionWithAll;
  let openedLiveSession: LiveSessionWithAll;

  beforeEach(async () => {
    breakedLiveSession = await liveSessionFactory.createAndSave({
      access_level: access_level.PUBLIC,
      status: live_session_status.BREAKED,
      organizer: {
        connect: { id: organizer.id },
      },
    });

    breakedLiveSession2 = await liveSessionFactory.createAndSave({
      access_level: access_level.PUBLIC,
      status: live_session_status.BREAKED,
      organizer: {
        connect: { id: organizer.id },
      },
    });

    openedLiveSession = await liveSessionFactory.createAndSave({
      access_level: access_level.PUBLIC,
      status: live_session_status.OPENED,
      organizer: {
        connect: { id: organizer.id },
      },
    });
  });

  beforeAll(async () => {
    await currUser.insert();

    for (const user of testUserData.users) {
      await prismaClient.user.create({
        data: {
          ...user,
          pfp: {
            create: user.pfp,
          },
        },
      });
    }
  });

  afterEach(async () => {
    liveSessionFactory.cleanup();
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  afterAll(async () => {
    await currUser.delete();
    await prismaClient.user.deleteMany({});
    await prismaClient.live_session.deleteMany({});
  });

  describe(`BroadCast`, () => {
    let organizerSocket: ClientSocket;
    let participant1Socket: ClientSocket;
    let participant2Socket: ClientSocket;
    let otherSessionParticipantSocket: ClientSocket;

    // Socket 연결을 위한 헬퍼 함수
    const connectSockets = (sessionId: string, done: jest.DoneCallback) => {
      organizerSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${sessionId}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
        }
      );

      participant1Socket = ioc(
        process.env.SERVER_URL +
          `/livesession/${sessionId}?role=${Role.participant}`,
        {
          extraHeaders: { userId: participant1.id.toString() },
        }
      );

      participant2Socket = ioc(
        process.env.SERVER_URL +
          `/livesession/${sessionId}?role=${Role.participant}`,
        {
          extraHeaders: { userId: participant2.id.toString() },
        }
      );

      otherSessionParticipantSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${breakedLiveSession2.id}?role=${Role.participant}`,
        {
          extraHeaders: { userId: otherSessionParticipant.id.toString() },
        }
      );

      let connectedCount = 0;
      const onConnect = () => {
        connectedCount++;
        if (connectedCount === 4) {
          done();
        }
      };

      organizerSocket.on('connect', onConnect);
      participant1Socket.on('connect', onConnect);
      participant2Socket.on('connect', onConnect);
      otherSessionParticipantSocket.on('connect', onConnect);
    };

    const disconnectAllSockets = () => {
      organizerSocket?.disconnect();
      participant1Socket?.disconnect();
      participant2Socket?.disconnect();
      otherSessionParticipantSocket?.disconnect();
    };

    describe('to breaked live session', () => {
      beforeEach((done) => {
        connectSockets(breakedLiveSession.id, done);
      });

      afterEach(() => {
        disconnectAllSockets();
      });

      test('Response_200_Organizer_Broadcast', (done) => {
        const msg = 'test';
        const cb = jest.fn();

        organizerSocket.emit(WS_CHANNELS.chat.broadCastSend, msg, cb);

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          expect(cb.mock.calls[0][0].status).toEqual(200);
          done();
        }, 1000);
      });

      test('Response_200_Participant_Broadcast', (done) => {
        const msg = 'test';
        const cb = jest.fn();

        participant1Socket.emit(WS_CHANNELS.chat.broadCastSend, msg, cb);

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          expect(cb.mock.calls[0][0].status).toEqual(200);
          done();
        }, 1000);
      });

      test('Broadcasted_Chat_By_The_Organizer_Should_Be_Received_By_All_Participants_In_The_Same_Live_Session', (done) => {
        const msg = 'test';
        const broadCaster = organizer;
        const chat = {
          msg,
          user: {
            id: broadCaster.id,
            username: broadCaster.username,
            pfp: broadCaster.pfp.curr,
          },
        };
        let receivedCount = 0;
        const expectedReceiveCount = 3;

        organizerSocket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
          expect(data).toMatchObject(chat);
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant1Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
          expect(data).toMatchObject(chat);
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant2Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
          expect(data).toMatchObject(chat);
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.chat.broadCastRecive,
          (data) => {
            done(
              new Error(
                `Other session participant should not receive this message : ${data}`
              )
            );
          }
        );

        organizerSocket.emit(WS_CHANNELS.chat.broadCastSend, msg, jest.fn());
      });

      test('Broadcasted_Chat_By_The_Participant_Should_Be_Received_By_All_Participants_In_The_Same_Live_Session', (done) => {
        const msg = 'test';
        const broadCaster = participant1;
        const chat = {
          msg,
          user: {
            id: broadCaster.id,
            username: broadCaster.username,
            pfp: broadCaster.pfp.curr,
          },
        };

        let receivedCount = 0;
        const expectedReceiveCount = 3;

        organizerSocket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
          expect(data).toMatchObject(chat);
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant1Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
          expect(data).toMatchObject(chat);
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant2Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
          expect(data).toMatchObject(chat);
          receivedCount++;
          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.chat.broadCastRecive,
          (data) => {
            done(
              new Error(
                `Other session participant should not receive this message : ${data}`
              )
            );
          }
        );

        participant1Socket.emit(WS_CHANNELS.chat.broadCastSend, msg, jest.fn());
      });
    });

    describe('to opened live session', () => {
      beforeEach((done) => {
        // 다른 세션의 참여자는 breakedLiveSession2에 연결된 상태로 유지
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${openedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${openedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${openedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant2.id.toString() },
          }
        );

        // otherSessionParticipantSocket는 breakedLiveSession2에 계속 연결
        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${breakedLiveSession2.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: otherSessionParticipant.id.toString() },
          }
        );

        let connectedCount = 0;
        const onConnect = () => {
          connectedCount++;
          if (connectedCount === 4) {
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
        participant1Socket.on('connect', onConnect);
        participant2Socket.on('connect', onConnect);
        otherSessionParticipantSocket.on('connect', onConnect);
      });

      afterEach(() => {
        disconnectAllSockets();
      });

      test('Response_403_Organizer_Broadcast', (done) => {
        const msg = 'test';
        const cb = jest.fn();

        organizerSocket.emit(WS_CHANNELS.chat.broadCastSend, msg, cb);

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          expect(cb.mock.calls[0][0].status).toEqual(403);
          done();
        }, 1000);
      });

      test('Response_403_Participant_Broadcast', (done) => {
        const msg = 'test';
        const cb = jest.fn();

        participant1Socket.emit(WS_CHANNELS.chat.broadCastSend, msg, cb);

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          expect(cb.mock.calls[0][0].status).toEqual(403);
          done();
        }, 1000);
      });
    });
  });
});
