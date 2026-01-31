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
import {
  ResponseCb,
  SocketResponse,
} from '../../src/@types/augmentation/socket/response';
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
            `/${readyLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/${readyLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/${readyLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant2.id.toString() },
          }
        );

        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL +
            `/${otherLiveSession.id}?role=${Role.participant}`,
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
        await Promise.all([
          new Promise((resolve) => {
            organizerSocket.on('disconnect', resolve);
            organizerSocket.disconnect();
          }),
          new Promise((resolve) => {
            participant1Socket.on('disconnect', resolve);
            participant1Socket.disconnect();
          }),
          new Promise((resolve) => {
            participant2Socket.on('disconnect', resolve);
            participant2Socket.disconnect();
          }),
          new Promise((resolve) => {
            otherSessionParticipantSocket.on('disconnect', resolve);
            otherSessionParticipantSocket.disconnect();
          }),
        ]);

        await liveSessionFactory.cleanup();
      });

      test('Ready => Ready Must_Response_With_400', async () => {
        const res = await new Promise<{ status: number; message?: string }>(
          (resolve) =>
            organizerSocket.emit(WS_CHANNELS.transition.ready, (r: any) =>
              resolve(r)
            )
        );

        expect(res.status).toEqual(400);

        const _readyLiveSEssion = await prismaClient.live_session.findFirst({
          where: { id: readyLiveSession.id },
        });

        // status 또한 update되지 않았어야한다.
        expect(_readyLiveSEssion).toBeDefined();
        expect(_readyLiveSEssion!.status).toEqual(live_session_status.READY);
      });

      test('Ready => Opened Must_Response_With_200', async () => {
        const otherLiveSessionParticipantTransitionListener = () => {
          throw new Error('other live session  ');
        };

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        const waitForUpdate = (socket: ClientSocket) =>
          new Promise<LiveSessionField>((resolve) =>
            socket.once(
              WS_CHANNELS.livesession.update,
              (field: LiveSessionField) => resolve(field)
            )
          );

        const organizerConnectionPromise = waitForUpdate(organizerSocket);
        const participant1ConnectionPromise = waitForUpdate(participant1Socket);
        const participant2ConnectionPromise = waitForUpdate(participant2Socket);

        const organizerCallback = new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.open, (res: any) => {
            expect(res.status).toEqual(httpStatusCode.OK);
            resolve(res);
          })
        );

        await Promise.all([
          organizerConnectionPromise,
          participant1ConnectionPromise,
          participant2ConnectionPromise,
          organizerCallback,
        ]);

        const _readyLiveSession = await prismaClient.live_session.findFirst({
          where: { id: readyLiveSession.id },
          include: { live_session_transition_log: true },
        });

        expect(_readyLiveSession).toBeDefined();
        expect(_readyLiveSession!.status).toEqual(live_session_status.OPENED);

        expect(_readyLiveSession?.live_session_transition_log).toBeDefined();
        expect(_readyLiveSession!.live_session_transition_log).toHaveLength(1);
        expect(
          _readyLiveSession!.live_session_transition_log[0].from_state
        ).toEqual(live_session_status.READY);
        expect(
          _readyLiveSession!.live_session_transition_log[0].to_state
        ).toEqual(live_session_status.OPENED);
      });

      test('Ready => Breaked Must_Response_With_400', async () => {
        const res = await new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.break, (r: any) =>
            resolve(r)
          )
        );

        expect(res.status).toEqual(400);

        // status 또한 update되지 않았어야한다.
        const _readyLiveSEssion = await prismaClient.live_session.findFirst({
          where: { id: readyLiveSession.id },
        });

        // status 또한 update되지 않았어야한다.
        expect(_readyLiveSEssion).toBeDefined();
        expect(_readyLiveSEssion!.status).toEqual(live_session_status.READY);
      });

      test('Ready => Closed Must_Response_With_200', async () => {
        const otherLiveSessionParticipantTransitionListener = () => {
          throw new Error('other live session must not recive update notify');
        };

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        const waitForUpdate = (socket: ClientSocket) =>
          new Promise<LiveSessionField>((resolve) =>
            socket.once(
              WS_CHANNELS.livesession.update,
              (field: LiveSessionField) => resolve(field)
            )
          );

        const organizerConnectionPromise = waitForUpdate(organizerSocket);
        const participant1ConnectionPromise = waitForUpdate(participant1Socket);
        const participant2ConnectionPromise = waitForUpdate(participant2Socket);

        const organizerCallback = new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.close, (res: any) => {
            expect(res.status).toEqual(httpStatusCode.OK);
            resolve(res);
          })
        );

        await Promise.all([
          organizerConnectionPromise,
          participant1ConnectionPromise,
          participant2ConnectionPromise,
          organizerCallback,
        ]);

        const _readyLiveSession = await prismaClient.live_session.findFirst({
          where: { id: readyLiveSession.id },
          include: { live_session_transition_log: true },
        });

        expect(_readyLiveSession).toBeDefined();
        expect(_readyLiveSession!.status).toEqual(live_session_status.CLOSED);

        expect(_readyLiveSession?.live_session_transition_log).toBeDefined();
        expect(_readyLiveSession!.live_session_transition_log).toHaveLength(1);
        expect(
          _readyLiveSession!.live_session_transition_log[0].from_state
        ).toEqual(live_session_status.READY);

        expect(
          _readyLiveSession!.live_session_transition_log[0].to_state
        ).toEqual(live_session_status.CLOSED);
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
            `/${openedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/${openedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/${openedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant2.id.toString() },
          }
        );

        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL +
            `/${otherLiveSession.id}?role=${Role.participant}`,
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
        await Promise.all([
          new Promise((resolve) => {
            organizerSocket.on('disconnect', resolve);
            organizerSocket.disconnect();
          }),
          new Promise((resolve) => {
            participant1Socket.on('disconnect', resolve);
            participant1Socket.disconnect();
          }),
          new Promise((resolve) => {
            participant2Socket.on('disconnect', resolve);
            participant2Socket.disconnect();
          }),
          new Promise((resolve) => {
            otherSessionParticipantSocket.on('disconnect', resolve);
            otherSessionParticipantSocket.disconnect();
          }),
        ]);

        await liveSessionFactory.cleanup();
      });

      test('Opened => Ready Must_Response_With_400', async () => {
        const res = await new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.ready, (r: any) =>
            resolve(r)
          )
        );

        expect(res.status).toEqual(400);

        const _openedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: openedLiveSession.id },
        });

        expect(_openedLiveSession).toBeDefined();
        expect(_openedLiveSession!.status).toEqual(live_session_status.OPENED);
      });

      test('Opened => Opened Must_Response_With_400', async () => {
        const res = await new Promise<{ status: number; message?: string }>(
          (resolve) =>
            organizerSocket.emit(WS_CHANNELS.transition.open, (r: any) =>
              resolve(r)
            )
        );

        expect(res.status).toEqual(400);

        const _openedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: openedLiveSession.id },
        });

        // status 또한 update되지 않았어야한다.
        expect(_openedLiveSession).toBeDefined();
        expect(_openedLiveSession!.status).toEqual(live_session_status.OPENED);
      });

      test('Opened => Breaked Must_Response_With_200', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn(() => {
          throw new Error('other live session');
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        const waitForUpdate = (socket: ClientSocket) =>
          new Promise<LiveSessionField>((resolve) =>
            socket.once(
              WS_CHANNELS.livesession.update,
              (field: LiveSessionField) => resolve(field)
            )
          );

        const organizerConnectionPromise = waitForUpdate(organizerSocket);
        const participant1ConnectionPromise = waitForUpdate(participant1Socket);
        const participant2ConnectionPromise = waitForUpdate(participant2Socket);

        const organizerAckPromise = new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.break, (res: any) => {
            expect(res.status).toEqual(httpStatusCode.OK);
            resolve(res);
          })
        );

        await Promise.all([
          organizerConnectionPromise,
          participant1ConnectionPromise,
          participant2ConnectionPromise,
          organizerAckPromise,
        ]);

        const _openedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: openedLiveSession.id },
          include: { live_session_transition_log: true },
        });

        expect(_openedLiveSession).toBeDefined();
        expect(_openedLiveSession!.status).toEqual(live_session_status.BREAKED);

        expect(_openedLiveSession?.live_session_transition_log).toBeDefined();
        expect(_openedLiveSession!.live_session_transition_log).toHaveLength(1);
        expect(
          _openedLiveSession!.live_session_transition_log[0].from_state
        ).toEqual(live_session_status.OPENED);
        expect(
          _openedLiveSession!.live_session_transition_log[0].to_state
        ).toEqual(live_session_status.BREAKED);
      });

      test('Opened => Closed Must_Response_With_200', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn(() => {
          throw new Error('other live session');
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        const waitForUpdate = (socket: ClientSocket) =>
          new Promise<LiveSessionField>((resolve) =>
            socket.once(
              WS_CHANNELS.livesession.update,
              (field: LiveSessionField) => resolve(field)
            )
          );

        const organizerConnectionPromise = waitForUpdate(organizerSocket);
        const participant1ConnectionPromise = waitForUpdate(participant1Socket);
        const participant2ConnectionPromise = waitForUpdate(participant2Socket);

        const organizerCallback = new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.close, (res: any) => {
            expect(res.status).toEqual(httpStatusCode.OK);
            resolve(res);
          })
        );

        await Promise.all([
          organizerConnectionPromise,
          participant1ConnectionPromise,
          participant2ConnectionPromise,
          organizerCallback,
        ]);

        const _openedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: openedLiveSession.id },
          include: { live_session_transition_log: true },
        });

        expect(_openedLiveSession).toBeDefined();
        expect(_openedLiveSession!.status).toEqual(live_session_status.CLOSED);

        expect(_openedLiveSession?.live_session_transition_log).toBeDefined();
        expect(_openedLiveSession!.live_session_transition_log).toHaveLength(1);
        expect(
          _openedLiveSession!.live_session_transition_log[0].from_state
        ).toEqual(live_session_status.OPENED);
        expect(
          _openedLiveSession!.live_session_transition_log[0].to_state
        ).toEqual(live_session_status.CLOSED);
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
            `/${breakedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL +
            `/${breakedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL +
            `/${breakedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant2.id.toString() },
          }
        );

        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL +
            `/${otherLiveSession.id}?role=${Role.participant}`,
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
        await Promise.all([
          new Promise((resolve) => {
            organizerSocket.on('disconnect', resolve);
            organizerSocket.disconnect();
          }),
          new Promise((resolve) => {
            participant1Socket.on('disconnect', resolve);
            participant1Socket.disconnect();
          }),
          new Promise((resolve) => {
            participant2Socket.on('disconnect', resolve);
            participant2Socket.disconnect();
          }),
          new Promise((resolve) => {
            otherSessionParticipantSocket.on('disconnect', resolve);
            otherSessionParticipantSocket.disconnect();
          }),
        ]);

        await liveSessionFactory.cleanup();
      });

      test('Breaked => Ready Must_Response_With_400', async () => {
        const res = await new Promise<{ status: number; message?: string }>(
          (resolve) =>
            organizerSocket.emit(WS_CHANNELS.transition.ready, (r: any) =>
              resolve(r)
            )
        );

        expect(res.status).toEqual(400);

        const _breakedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: breakedLiveSession.id },
        });

        // status 또한 update되지 않았어야한다.
        expect(_breakedLiveSession).toBeDefined();
        expect(_breakedLiveSession!.status).toEqual(
          live_session_status.BREAKED
        );
      });

      test('Breaked => Opened Must_Response_With_200', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn(() => {
          throw new Error('other live session');
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        const waitForUpdate = (socket: ClientSocket) =>
          new Promise<LiveSessionField>((resolve) =>
            socket.once(
              WS_CHANNELS.livesession.update,
              (field: LiveSessionField) => resolve(field)
            )
          );

        const organizerConnectionPromise = waitForUpdate(organizerSocket);
        const participant1ConnectionPromise = waitForUpdate(participant1Socket);
        const participant2ConnectionPromise = waitForUpdate(participant2Socket);

        const organizerCallback = new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.open, (res: any) => {
            expect(res.status).toEqual(httpStatusCode.OK);
            resolve(res);
          })
        );

        await Promise.all([
          organizerConnectionPromise,
          participant1ConnectionPromise,
          participant2ConnectionPromise,
          organizerCallback,
        ]);

        const _breakedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: breakedLiveSession.id },
          include: { live_session_transition_log: true },
        });

        expect(_breakedLiveSession).toBeDefined();
        expect(_breakedLiveSession!.status).toEqual(live_session_status.OPENED);

        expect(_breakedLiveSession?.live_session_transition_log).toBeDefined();
        expect(_breakedLiveSession!.live_session_transition_log).toHaveLength(
          1
        );
        expect(
          _breakedLiveSession!.live_session_transition_log[0].from_state
        ).toEqual(live_session_status.BREAKED);
        expect(
          _breakedLiveSession!.live_session_transition_log[0].to_state
        ).toEqual(live_session_status.OPENED);
      });

      test('Breaked => Breaked Must_Response_With_400', async () => {
        const res = await new Promise<{ status: number; message?: string }>(
          (resolve) =>
            organizerSocket.emit(WS_CHANNELS.transition.break, (r: any) =>
              resolve(r)
            )
        );

        expect(res.status).toEqual(400);

        const _breakedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: breakedLiveSession.id },
        });

        // status 또한 update되지 않았어야한다.
        expect(_breakedLiveSession).toBeDefined();
        expect(_breakedLiveSession!.status).toEqual(
          live_session_status.BREAKED
        );
      });

      test('Breaked => Closed Must_Response_With_200', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn(() => {
          throw new Error('other live session');
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        const waitForUpdate = (socket: ClientSocket) =>
          new Promise<LiveSessionField>((resolve) =>
            socket.once(
              WS_CHANNELS.livesession.update,
              (field: LiveSessionField) => resolve(field)
            )
          );

        const organizerConnectionPromise = waitForUpdate(organizerSocket);
        const participant1ConnectionPromise = waitForUpdate(participant1Socket);
        const participant2ConnectionPromise = waitForUpdate(participant2Socket);

        const organizerCallback = new Promise<SocketResponse>((resolve) =>
          organizerSocket.emit(WS_CHANNELS.transition.close, (res: any) => {
            expect(res.status).toEqual(httpStatusCode.OK);
            resolve(res);
          })
        );

        await Promise.all([
          organizerConnectionPromise,
          participant1ConnectionPromise,
          participant2ConnectionPromise,
          organizerCallback,
        ]);

        const _breakedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: breakedLiveSession.id },
          include: { live_session_transition_log: true },
        });

        expect(_breakedLiveSession).toBeDefined();
        expect(_breakedLiveSession!.status).toEqual(live_session_status.CLOSED);

        expect(_breakedLiveSession?.live_session_transition_log).toBeDefined();
        expect(_breakedLiveSession!.live_session_transition_log).toHaveLength(
          1
        );
        expect(
          _breakedLiveSession!.live_session_transition_log[0].from_state
        ).toEqual(live_session_status.BREAKED);
        expect(
          _breakedLiveSession!.live_session_transition_log[0].to_state
        ).toEqual(live_session_status.CLOSED);
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

        Promise.all([
          new Promise((resolve) => {
            organizerSocket.on('disconnect', resolve);
            organizerSocket.disconnect();
          }),
        ]);
      });

      test('Must_Connection_Error_Raised_To_Closed_Live_Session', async () => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/${closedLiveSession}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        await new Promise<void>((resolve) =>
          organizerSocket.on('connect_error', (err) => {
            expect(err).toBeDefined();
            expect(organizerSocket.connected).toBeFalsy();
            resolve();
          })
        );
      });
    });
  });
});
