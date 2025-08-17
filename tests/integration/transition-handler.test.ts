import { httpServer } from '../../src/http';
import WS_CHANNELS from '../../src/constants/channels';
import { Socket as ClientSocket } from 'socket.io-client';
import ioc from 'socket.io-client';
import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';

import { access_level } from '@prisma/client';
import { live_session_status } from '@prisma/client';

import httpStatusCode from 'http-status-codes';
import liveSessionFactory, {
  LiveSessionWithAll,
} from '../factories/live-session-factory';
import { Role } from '../../src/enums/session';

describe('Transition Handler', () => {
  afterAll(() => {
    httpServer.close();
  });

  afterAll(async () => {
    await prismaClient.user.deleteMany({});
  });

  beforeAll(async () => {
    for (let user of testUserData.users) {
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

  describe('Broadcast Transition', () => {
    let organizer = testUserData.currUser;
    let participant1 = testUserData.users[1];
    let participant2 = testUserData.users[2];
    let otherSessionParticipant = testUserData.users[3]; // New participant for a different session

    let organizerSocket: ClientSocket;
    let participant1Socket: ClientSocket;
    let participant2Socket: ClientSocket;
    let otherSessionParticipantSocket: ClientSocket; // Socket for the new participant

    describe('Open => Break', () => {
      let openedLiveSession: LiveSessionWithAll;
      let otherLiveSession: LiveSessionWithAll;

      beforeAll(async () => {
        openedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.OPENED,
          organizer: {
            connect: { id: organizer.id },
          },
        });

        otherLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.OPENED,
          organizer: {
            connect: { id: organizer.id },
          },
        });
      });

      afterAll(async () => {
        await prismaClient.live_session.deleteMany({});
      });

      beforeEach((done) => {
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

        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${otherLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: otherSessionParticipant.id.toString() },
          }
        );

        let connectedCount = 0;
        const onConnect = () => {
          connectedCount++;
          if (connectedCount === 4) {
            // Now we have 4 participants to connect
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
        participant1Socket.on('connect', onConnect);
        participant2Socket.on('connect', onConnect);
        otherSessionParticipantSocket.on('connect', onConnect);
      });

      afterEach(() => {
        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Response_200_Organizer_Transition', (done) => {
        const cb = jest.fn();

        organizerSocket.emit(WS_CHANNELS.transition.break, cb);

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          expect(cb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
          done();
        }, 1000);
      });

      test('Broadcasted_Transition_By_The_Organizer_Should_Be_Received_By_All_Participants', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message

        organizerSocket.on(WS_CHANNELS.transition.broadCast.break, () => {
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant1Socket.on(WS_CHANNELS.transition.broadCast.break, () => {
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant2Socket.on(WS_CHANNELS.transition.broadCast.break, () => {
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        // other live session의 participant는 broadcast를 받지 않아야한다.
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.break,
          () => {
            done(
              new Error(
                'transition event should not be emitted for other live sessions'
              )
            );
          }
        );

        organizerSocket.emit(WS_CHANNELS.transition.break, jest.fn());
      });
    });

    describe('Break => Open', () => {
      let breakedLiveSession: LiveSessionWithAll;
      let otherLiveSession: LiveSessionWithAll;
      beforeAll(async () => {
        breakedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.BREAKED,
          organizer: {
            connect: { id: organizer.id },
          },
        });

        otherLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.BREAKED,
          organizer: {
            connect: { id: organizer.id },
          },
        });
      });

      afterAll(async () => {
        await prismaClient.live_session.deleteMany({});
      });

      beforeEach((done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${breakedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${breakedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${breakedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant2.id.toString() },
          }
        );

        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${otherLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: otherSessionParticipant.id.toString() },
          }
        );

        let connectedCount = 0;
        const onConnect = () => {
          connectedCount++;
          if (connectedCount === 4) {
            // Now we have 4 participants to connect
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
        participant1Socket.on('connect', onConnect);
        participant2Socket.on('connect', onConnect);
        otherSessionParticipantSocket.on('connect', onConnect);
      });

      afterEach(() => {
        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Response_200_Organizer_Transition', (done) => {
        const cb = jest.fn();

        organizerSocket.emit(WS_CHANNELS.transition.open, cb);

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          expect(cb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
          done();
        }, 1000);
      });

      test('Broadcasted_Transition_By_The_Organizer_Should_Be_Received_By_All_Participants', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message

        organizerSocket.on(WS_CHANNELS.transition.broadCast.open, () => {
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant1Socket.on(WS_CHANNELS.transition.broadCast.open, () => {
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        participant2Socket.on(WS_CHANNELS.transition.broadCast.open, () => {
          receivedCount++;

          if (receivedCount === expectedReceiveCount) {
            done();
          }
        });

        // other live session의 participant는 broadcast를 받지 않아야한다.
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.open,
          () => {
            done(
              new Error(
                'transition event should not be emitted for other live sessions'
              )
            );
          }
        );

        organizerSocket.emit(WS_CHANNELS.transition.open, jest.fn());
      });
    });
  });
});
