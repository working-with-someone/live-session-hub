import { httpServer } from '../../src/http';
import WS_CHANNELS from '../../src/constants/channels';
import { Socket as ClientSocket } from 'socket.io-client';
import ioc from 'socket.io-client';
import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';

import { access_level } from '@prisma/client';
import { live_session_status } from '@prisma/client';

import httpStatusCode from 'http-status-codes';
import liveSessionFactory from '../factories/live-session-factory';
import { Role } from '../../src/enums/session';
import { ResponseCb } from '../../src/@types/augmentation/socket/response';
import {
  LiveSessionField,
  LiveSessionWithAll,
} from '../../src/@types/liveSession';
import currUser from '../data/curr-user';

describe('Transition Handler', () => {
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

  afterAll((done) => {
    httpServer.close(done);
  });

  afterAll(async () => {
    await liveSessionFactory.cleanup();
    await currUser.delete();

    await prismaClient.user.deleteMany({});
  });

  describe('Broadcast Transition', () => {
    const organizer = currUser;
    const participant1 = testUserData.users[0];
    const participant2 = testUserData.users[1];
    const otherSessionParticipant = testUserData.users[2];

    let organizerSocket: ClientSocket;
    let participant1Socket: ClientSocket;
    let participant2Socket: ClientSocket;
    let otherSessionParticipantSocket: ClientSocket;

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
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
        participant1Socket.on('connect', onConnect);
        participant2Socket.on('connect', onConnect);
        otherSessionParticipantSocket.on('connect', onConnect);
      });

      afterEach(() => {
        liveSessionFactory.cleanup();
        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Ready => Ready Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);
          const _readyLiveSEssion = await prismaClient.live_session.findFirst({
            where: { id: readyLiveSession.id },
          });

          expect(_readyLiveSEssion).toBeDefined();
          expect(_readyLiveSEssion!.status).toEqual(live_session_status.READY);

          done();
        };

        organizerSocket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant1Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant2Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.ready,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);
      });

      test('Ready => Opened Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3;
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

            const _readyLiveSession = await prismaClient.live_session.findFirst(
              {
                where: { id: readyLiveSession.id },
                include: {
                  live_session_transition_log: true,
                },
              }
            );
            expect(_readyLiveSession).toBeDefined();
            expect(_readyLiveSession!.status).toEqual(
              live_session_status.OPENED
            );

            expect(
              _readyLiveSession?.live_session_transition_log
            ).toBeDefined();
            expect(_readyLiveSession!.live_session_transition_log).toHaveLength(
              1
            );
            expect(
              _readyLiveSession!.live_session_transition_log[0].from_state
            ).toEqual(live_session_status.READY);
            expect(
              _readyLiveSession!.live_session_transition_log[0].to_state
            ).toEqual(live_session_status.OPENED);

            done();
          }
        };

        organizerSocket.on(WS_CHANNELS.livesession.update, checkComplete);

        participant1Socket.on(WS_CHANNELS.livesession.update, checkComplete);

        participant2Socket.on(WS_CHANNELS.livesession.update, checkComplete);

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);
      });

      test('Ready => Breaked Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const transitionCb: ResponseCb = async ({ status }) => {
          expect(status).toEqual(400);
          const _readyLiveSEssion = await prismaClient.live_session.findFirst({
            where: { id: readyLiveSession.id },
          });

          expect(_readyLiveSEssion).toBeDefined();
          expect(_readyLiveSEssion!.status).toEqual(live_session_status.READY);

          done();
        };

        organizerSocket.on(WS_CHANNELS.transition.broadCast.break, () => {});
        participant1Socket.on(WS_CHANNELS.transition.broadCast.break, () => {});
        participant2Socket.on(WS_CHANNELS.transition.broadCast.break, () => {});

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.break,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
      });

      test('Ready => Closed Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3;
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

            const _readyLiveSession = await prismaClient.live_session.findFirst(
              {
                where: { id: readyLiveSession.id },
                include: {
                  live_session_transition_log: true,
                },
              }
            );
            expect(_readyLiveSession).toBeDefined();
            expect(_readyLiveSession!.status).toEqual(
              live_session_status.CLOSED
            );

            expect(
              _readyLiveSession?.live_session_transition_log
            ).toBeDefined();
            expect(_readyLiveSession!.live_session_transition_log).toHaveLength(
              1
            );
            expect(
              _readyLiveSession!.live_session_transition_log[0].from_state
            ).toEqual(live_session_status.READY);
            expect(
              _readyLiveSession!.live_session_transition_log[0].to_state
            ).toEqual(live_session_status.CLOSED);

            done();
          }
        };

        organizerSocket.on(WS_CHANNELS.livesession.update, checkComplete);

        participant1Socket.on(WS_CHANNELS.livesession.update, checkComplete);

        participant2Socket.on(WS_CHANNELS.livesession.update, checkComplete);

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

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
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
        participant1Socket.on('connect', onConnect);
        participant2Socket.on('connect', onConnect);
        otherSessionParticipantSocket.on('connect', onConnect);
      });

      afterEach(async () => {
        await liveSessionFactory.cleanup();

        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Opened => Ready Must_Response_With_400', (done) => {
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

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);
      });

      test('Opened => Opened Must_Response_With_400', (done) => {
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
        const expectedReceiveCount = 3;
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const checkComplete = async (field: LiveSessionField) => {
          if (field == 'status') {
            receivedCount++;
          }

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
                include: {
                  live_session_transition_log: true,
                },
              });
            expect(_openedLiveSession).toBeDefined();
            expect(_openedLiveSession!.status).toEqual(
              live_session_status.BREAKED
            );

            expect(
              _openedLiveSession?.live_session_transition_log
            ).toBeDefined();
            expect(
              _openedLiveSession!.live_session_transition_log
            ).toHaveLength(1);
            expect(
              _openedLiveSession!.live_session_transition_log[0].from_state
            ).toEqual(live_session_status.OPENED);
            expect(
              _openedLiveSession!.live_session_transition_log[0].to_state
            ).toEqual(live_session_status.BREAKED);

            done();
          }
        };

        organizerSocket.on(WS_CHANNELS.livesession.update, checkComplete);
        participant1Socket.on(WS_CHANNELS.livesession.update, checkComplete);
        participant2Socket.on(WS_CHANNELS.livesession.update, checkComplete);
        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );
        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);
      });

      test('Opened => Closed Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3;
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
                include: {
                  live_session_transition_log: true,
                },
              });
            expect(_openedLiveSession).toBeDefined();
            expect(_openedLiveSession!.status).toEqual(
              live_session_status.CLOSED
            );

            expect(
              _openedLiveSession?.live_session_transition_log
            ).toBeDefined();
            expect(
              _openedLiveSession!.live_session_transition_log
            ).toHaveLength(1);
            expect(
              _openedLiveSession!.live_session_transition_log[0].from_state
            ).toEqual(live_session_status.OPENED);
            expect(
              _openedLiveSession!.live_session_transition_log[0].to_state
            ).toEqual(live_session_status.CLOSED);

            done();
          }
        };

        organizerSocket.on(WS_CHANNELS.livesession.update, checkComplete);
        participant1Socket.on(WS_CHANNELS.livesession.update, checkComplete);
        participant2Socket.on(WS_CHANNELS.livesession.update, checkComplete);
        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );
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
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
        participant1Socket.on('connect', onConnect);
        participant2Socket.on('connect', onConnect);
        otherSessionParticipantSocket.on('connect', onConnect);
      });

      afterEach(() => {
        liveSessionFactory.cleanup();

        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Breaked => Ready Must_Response_With_400', (done) => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();

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

          done();
        };

        organizerSocket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant1Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});
        participant2Socket.on(WS_CHANNELS.transition.broadCast.ready, () => {});

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.ready,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);
      });

      test('Breaked => Opened Must_Response_With_200', (done) => {
        let receivedCount = 0;
        const expectedReceiveCount = 3;
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
                include: {
                  live_session_transition_log: true,
                },
              });

            expect(_breakedLiveSession).toBeDefined();
            expect(_breakedLiveSession!.status).toEqual(
              live_session_status.OPENED
            );

            expect(
              _breakedLiveSession?.live_session_transition_log
            ).toBeDefined();
            expect(
              _breakedLiveSession!.live_session_transition_log
            ).toHaveLength(1);
            expect(
              _breakedLiveSession!.live_session_transition_log[0].from_state
            ).toEqual(live_session_status.BREAKED);
            expect(
              _breakedLiveSession!.live_session_transition_log[0].to_state
            ).toEqual(live_session_status.OPENED);

            done();
          }
        };

        organizerSocket.on(WS_CHANNELS.livesession.update, checkComplete);

        participant1Socket.on(WS_CHANNELS.livesession.update, checkComplete);

        participant2Socket.on(WS_CHANNELS.livesession.update, checkComplete);

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
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
        const expectedReceiveCount = 3;
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const checkComplete = async (field: LiveSessionField) => {
          if (field == 'status') {
            receivedCount++;
          }

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
                include: {
                  live_session_transition_log: true,
                },
              });
            expect(_breakedLiveSession).toBeDefined();
            expect(_breakedLiveSession!.status).toEqual(
              live_session_status.CLOSED
            );

            expect(
              _breakedLiveSession?.live_session_transition_log
            ).toBeDefined();
            expect(
              _breakedLiveSession!.live_session_transition_log
            ).toHaveLength(1);
            expect(
              _breakedLiveSession!.live_session_transition_log[0].from_state
            ).toEqual(live_session_status.BREAKED);
            expect(
              _breakedLiveSession!.live_session_transition_log[0].to_state
            ).toEqual(live_session_status.CLOSED);

            done();
          }
        };

        organizerSocket.on(WS_CHANNELS.livesession.update, checkComplete);
        participant1Socket.on(WS_CHANNELS.livesession.update, checkComplete);
        participant2Socket.on(WS_CHANNELS.livesession.update, checkComplete);
        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );
        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);
      });
    });

    describe('Closed => ?', () => {
      let closedLiveSession: LiveSessionWithAll;
      let organizerSocket: ClientSocket;

      beforeEach(async () => {
        closedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.CLOSED,
          organizer: {
            connect: { id: organizer.id },
          },
        });
      });

      afterEach(async () => {
        await liveSessionFactory.cleanup();
      });

      test('Must_Connection_Error_Raised_To_Closed_Live_Session', (done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${closedLiveSession}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        organizerSocket.on('connect_error', (err) => {
          expect(err).toBeDefined();
          expect(organizerSocket.connected).toBeFalsy();
          done();
        });
      });
    });
  });
});
