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
import { ResponseCb } from '../../src/@types/augmentation/socket/response';

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

    describe('Ready => ?', () => {
      let readyLiveSession: LiveSessionWithAll;
      let otherLiveSession: LiveSessionWithAll;

      beforeEach(async () => {
        readyLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.READY,
          organizer: {
            connect: { id: organizer.id },
          },
        });

        otherLiveSession = await liveSessionFactory.createAndSave({
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

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${readyLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${readyLiveSession.id}?role=${Role.participant}`,
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

      test('Ready => Ready Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);
          // participant 모두가 transition braodcast를 받지 않아야한다.

          // live session의 status가 update되지 않아야한다.
          const _readyLiveSEssion = await prismaClient.live_session.findFirst({
            where: { id: readyLiveSession.id },
          });

          expect(_readyLiveSEssion).toBeDefined();
          expect(_readyLiveSEssion!.status).toEqual(live_session_status.READY);

          done();
        };

        // Set up broadcast listeners for all participants
        organizerSocket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant1Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant2Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});

        // 다른 live session의 participant는 transition broadcast를 받지 않는다.
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.ready,
          otherLiveSessionParticipantTransitionListener
        );

        // emit transition
        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);
      });

      test('Ready => Opened Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message
        const transitionCb = jest.fn();

        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const checkComplete = async () => {
          receivedCount++;
          // 모든 aprticipant가 transition broadcast를 수신했다면
          if (receivedCount === expectedReceiveCount) {
            expect(transitionCb).toHaveBeenCalled();
            expect(transitionCb.mock.calls[0][0].status).toEqual(
              httpStatusCode.OK
            );

            // participant 모두가 transition braodcast를 받아야한다.
            expect(receivedCount).toEqual(expectedReceiveCount);

            // other live session participant가 transition braodcast를 받지 않아야한다.
            expect(
              otherLiveSessionParticipantTransitionListener
            ).not.toHaveBeenCalled();

            // live session의 status가 opened로 update되어야함.
            const _readyLiveSession = await prismaClient.live_session.findFirst(
              {
                where: { id: readyLiveSession.id },
              }
            );
            expect(_readyLiveSession).toBeDefined();
            expect(_readyLiveSession!.status).toEqual(
              live_session_status.OPENED
            );

            done();
          }
        };

        // Set up broadcast listeners for all participants
        organizerSocket.on(
          WS_CHANNELS.transition.broadCast.open,
          checkComplete
        );

        participant1Socket.on(
          WS_CHANNELS.transition.broadCast.open,
          checkComplete
        );

        participant2Socket.on(
          WS_CHANNELS.transition.broadCast.open,
          checkComplete
        );

        // Other live session participant should NOT receive broadcast
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.open,
          otherLiveSessionParticipantTransitionListener
        );

        // Emit the transition event
        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);
      });

      test('Ready => Breaked Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);
          // participant 모두가 transition braodcast를 받지 않아야한다.

          // live session의 status가 update되지 않아야한다.
          const _readyLiveSEssion = await prismaClient.live_session.findFirst({
            where: { id: readyLiveSession.id },
          });

          expect(_readyLiveSEssion).toBeDefined();
          expect(_readyLiveSEssion!.status).toEqual(live_session_status.READY);

          done();
        };

        // Set up broadcast listeners for all participants
        organizerSocket.on(WS_CHANNELS.transition.broadCast.break, () => {});
        participant1Socket.on(WS_CHANNELS.transition.broadCast.break, () => {});
        participant2Socket.on(WS_CHANNELS.transition.broadCast.break, () => {});

        // Other live session participant should NOT receive broadcast
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.break,
          otherLiveSessionParticipantTransitionListener
        );

        // Emit the transition event
        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
      });

      test('Ready => Closed Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message
        const transitionCb = jest.fn();

        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const checkComplete = async () => {
          receivedCount++;
          // 모든 aprticipant가 transition broadcast를 수신했다면
          if (receivedCount === expectedReceiveCount) {
            expect(transitionCb).toHaveBeenCalled();
            expect(transitionCb.mock.calls[0][0].status).toEqual(
              httpStatusCode.OK
            );

            // participant 모두가 transition braodcast를 받아야한다.
            expect(receivedCount).toEqual(expectedReceiveCount);

            // other live session participant가 transition braodcast를 받지 않아야한다.
            expect(
              otherLiveSessionParticipantTransitionListener
            ).not.toHaveBeenCalled();

            // live session의 status가 opened로 update되어야함.
            const _readyLiveSession = await prismaClient.live_session.findFirst(
              {
                where: { id: readyLiveSession.id },
              }
            );
            expect(_readyLiveSession).toBeDefined();
            expect(_readyLiveSession!.status).toEqual(
              live_session_status.CLOSED
            );

            done();
          }
        };

        // Set up broadcast listeners for all participants
        organizerSocket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );

        participant1Socket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );

        participant2Socket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );

        // Other live session participant should NOT receive broadcast
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.close,
          otherLiveSessionParticipantTransitionListener
        );

        // Emit the transition event
        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);
      });
    });

    describe('Opened => ?', () => {
      let openedLiveSession: LiveSessionWithAll;
      let otherLiveSession: LiveSessionWithAll;

      beforeEach(async () => {
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

      test('Opened => Ready Must_Response_With_400', (done) => {
        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);
          // live session의 status가 update되지 않아야한다.
          const _openedLiveSession = await prismaClient.live_session.findFirst({
            where: { id: openedLiveSession.id },
          });

          expect(_openedLiveSession).toBeDefined();
          expect(_openedLiveSession!.status).toEqual(
            live_session_status.OPENED
          );

          done();
        };

        // emit transition
        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);
      });

      test('Opened => Opened Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);

          const _openedLiveSession = await prismaClient.live_session.findFirst({
            where: { id: openedLiveSession.id },
          });

          expect(_openedLiveSession).toBeDefined();
          expect(_openedLiveSession!.status).toEqual(
            live_session_status.OPENED
          );

          done();
        };
        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);
      });

      test('Opened => Breaked Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const checkComplete = async () => {
          receivedCount++;
          if (receivedCount === expectedReceiveCount) {
            expect(transitionCb).toHaveBeenCalled();
            expect(transitionCb.mock.calls[0][0].status).toEqual(
              httpStatusCode.OK
            );
            expect(receivedCount).toEqual(expectedReceiveCount);
            expect(
              otherLiveSessionParticipantTransitionListener
            ).not.toHaveBeenCalled();
            const _openedLiveSession =
              await prismaClient.live_session.findFirst({
                where: { id: openedLiveSession.id },
              });
            expect(_openedLiveSession).toBeDefined();
            expect(_openedLiveSession!.status).toEqual(
              live_session_status.BREAKED
            );
            done();
          }
        };
        // Set up broadcast listeners for all participants
        organizerSocket.on(
          WS_CHANNELS.transition.broadCast.break,
          checkComplete
        );
        participant1Socket.on(
          WS_CHANNELS.transition.broadCast.break,
          checkComplete
        );
        participant2Socket.on(
          WS_CHANNELS.transition.broadCast.break,
          checkComplete
        );
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.break,
          otherLiveSessionParticipantTransitionListener
        );
        // Emit the transition event
        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
      });

      test('Opened => Closed Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const checkComplete = async () => {
          receivedCount++;
          if (receivedCount === expectedReceiveCount) {
            expect(transitionCb).toHaveBeenCalled();
            expect(transitionCb.mock.calls[0][0].status).toEqual(
              httpStatusCode.OK
            );
            expect(receivedCount).toEqual(expectedReceiveCount);
            expect(
              otherLiveSessionParticipantTransitionListener
            ).not.toHaveBeenCalled();
            const _openedLiveSession =
              await prismaClient.live_session.findFirst({
                where: { id: openedLiveSession.id },
              });
            expect(_openedLiveSession).toBeDefined();
            expect(_openedLiveSession!.status).toEqual(
              live_session_status.CLOSED
            );
            done();
          }
        };

        organizerSocket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );
        participant1Socket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );
        participant2Socket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.close,
          otherLiveSessionParticipantTransitionListener
        );
        // Emit the transition event
        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);
      });
    });

    describe('Breaked => ?', () => {
      let breakedLiveSession: LiveSessionWithAll;
      let otherLiveSession: LiveSessionWithAll;

      beforeEach(async () => {
        breakedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.BREAKED,
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

      test('Breaked => Ready Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);
          // participant 모두가 transition braodcast를 받지 않아야한다.

          // live session의 status가 update되지 않아야한다.
          const _breakedLiveSession = await prismaClient.live_session.findFirst(
            {
              where: { id: breakedLiveSession.id },
            }
          );

          expect(_breakedLiveSession).toBeDefined();
          expect(_breakedLiveSession!.status).toEqual(
            live_session_status.BREAKED
          );

          done();
        };

        // Set up broadcast listeners for all participants
        organizerSocket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant1Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant2Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});

        // 다른 live session의 participant는 transition broadcast를 받지 않는다.
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.ready,
          otherLiveSessionParticipantTransitionListener
        );

        // emit transition
        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);
      });

      test('Breaked => Opened Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const checkComplete = async () => {
          console.log('received!', receivedCount);
          receivedCount++;
          if (receivedCount === expectedReceiveCount) {
            expect(transitionCb).toHaveBeenCalled();
            expect(transitionCb.mock.calls[0][0].status).toEqual(
              httpStatusCode.OK
            );

            expect(receivedCount).toEqual(expectedReceiveCount);
            expect(
              otherLiveSessionParticipantTransitionListener
            ).not.toHaveBeenCalled();

            const _breakedLiveSession =
              await prismaClient.live_session.findFirst({
                where: { id: breakedLiveSession.id },
              });

            expect(_breakedLiveSession).toBeDefined();
            expect(_breakedLiveSession!.status).toEqual(
              live_session_status.OPENED
            );

            done();
          }
        };

        organizerSocket.on(
          WS_CHANNELS.transition.broadCast.open,
          checkComplete
        );

        participant1Socket.on(
          WS_CHANNELS.transition.broadCast.open,
          checkComplete
        );

        participant2Socket.on(
          WS_CHANNELS.transition.broadCast.open,
          checkComplete
        );

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.open,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);
      });

      test('Breaked => Breaked Must_Response_With_400', (done) => {
        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);

          const _breakedLiveSession = await prismaClient.live_session.findFirst(
            {
              where: { id: breakedLiveSession.id },
            }
          );

          expect(_breakedLiveSession).toBeDefined();
          expect(_breakedLiveSession!.status).toEqual(
            live_session_status.BREAKED
          );

          organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
          done();
        };

        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
      });

      test('Breaked => Closed Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3; // Only 3 participants should receive the message
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const checkComplete = async () => {
          receivedCount++;
          if (receivedCount === expectedReceiveCount) {
            expect(transitionCb).toHaveBeenCalled();

            expect(transitionCb.mock.calls[0][0].status).toEqual(
              httpStatusCode.OK
            );
            expect(receivedCount).toEqual(expectedReceiveCount);
            expect(
              otherLiveSessionParticipantTransitionListener
            ).not.toHaveBeenCalled();

            const _breakedLiveSession =
              await prismaClient.live_session.findFirst({
                where: { id: breakedLiveSession.id },
              });
            expect(_breakedLiveSession).toBeDefined();
            expect(_breakedLiveSession!.status).toEqual(
              live_session_status.CLOSED
            );
            done();
          }
        };

        organizerSocket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );
        participant1Socket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );
        participant2Socket.on(
          WS_CHANNELS.transition.broadCast.close,
          checkComplete
        );
        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.close,
          otherLiveSessionParticipantTransitionListener
        );
        // Emit the transition event
        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);
      });
    });

    describe('Closed => ?', () => {
      let closedLiveSession: LiveSessionWithAll;
      let otherLiveSession: LiveSessionWithAll;
      beforeEach(async () => {
        closedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.CLOSED,
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

      beforeEach((done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${closedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${closedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/livesession/${closedLiveSession.id}?role=${Role.participant}`,
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

      test('Closed => Ready Must_Response_With_400', (done) => {
        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);

          const _closedLiveSession = await prismaClient.live_session.findFirst({
            where: { id: closedLiveSession.id },
          });

          expect(_closedLiveSession).toBeDefined();
          expect(_closedLiveSession!.status).toEqual(
            live_session_status.CLOSED
          );

          done();
        };

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);
      });

      test('Closed => Opened Must_Response_With_400', (done) => {
        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);

          const _closedLiveSession = await prismaClient.live_session.findFirst({
            where: { id: closedLiveSession.id },
          });

          expect(_closedLiveSession).toBeDefined();
          expect(_closedLiveSession!.status).toEqual(
            live_session_status.CLOSED
          );

          done();
        };

        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);
      });

      test('Closed => Breaked Must_Response_With_400', (done) => {
        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);

          const _closedLiveSession = await prismaClient.live_session.findFirst({
            where: { id: closedLiveSession.id },
          });

          expect(_closedLiveSession).toBeDefined();
          expect(_closedLiveSession!.status).toEqual(
            live_session_status.CLOSED
          );

          done();
        };

        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
      });

      test('Closed => Closed Must_Response_With_400', (done) => {
        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);

          const _closedLiveSession = await prismaClient.live_session.findFirst({
            where: { id: closedLiveSession.id },
          });

          expect(_closedLiveSession).toBeDefined();
          expect(_closedLiveSession!.status).toEqual(
            live_session_status.CLOSED
          );

          done();
        };

        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);
      });
    });
  });
});
