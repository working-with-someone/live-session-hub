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
import { LiveSessionWithAll } from '../../src/@types/liveSession';
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

      beforeEach(async () => {
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

        const connectPromises = [
          new Promise<void>((resolve) =>
            organizerSocket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            participant1Socket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            participant2Socket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            otherSessionParticipantSocket.once('connect', resolve)
          ),
        ];

        await Promise.all(connectPromises);
      });

      afterEach(() => {
        liveSessionFactory.cleanup();
        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Ready => Opened Must_Response_With_200', async () => {
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        // 각 소켓 이벤트를 Promise로 래핑
        const organizerUpdatePromise = new Promise((resolve) => {
          organizerSocket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant1UpdatePromise = new Promise((resolve) => {
          participant1Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant2UpdatePromise = new Promise((resolve) => {
          participant2Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);

        await Promise.all([
          organizerUpdatePromise,
          participant1UpdatePromise,
          participant2UpdatePromise,
          transitionPromise,
        ]);

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);

        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

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

      test('Ready => Ready Must_Response_With_400', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const transitionCb = jest.fn();

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.ready,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);

        await transitionPromise;

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(400);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

        const _readyLiveSession = await prismaClient.live_session.findFirst({
          where: { id: readyLiveSession.id },
        });

        expect(_readyLiveSession).toBeDefined();
        expect(_readyLiveSession!.status).toEqual(live_session_status.READY);
      });

      test('Ready => Breaked Must_Response_With_400', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const transitionCb = jest.fn();

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.break,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);

        await transitionPromise;

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(400);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

        const _readyLiveSession = await prismaClient.live_session.findFirst({
          where: { id: readyLiveSession.id },
        });

        expect(_readyLiveSession).toBeDefined();
        expect(_readyLiveSession!.status).toEqual(live_session_status.READY);
      });

      test('Ready => Closed Must_Response_With_200', async () => {
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const organizerUpdatePromise = new Promise((resolve) => {
          organizerSocket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant1UpdatePromise = new Promise((resolve) => {
          participant1Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant2UpdatePromise = new Promise((resolve) => {
          participant2Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);

        await Promise.all([
          organizerUpdatePromise,
          participant1UpdatePromise,
          participant2UpdatePromise,
          transitionPromise,
        ]);

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

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

      beforeEach(async () => {
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

        const connectPromises = [
          new Promise<void>((resolve) =>
            organizerSocket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            participant1Socket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            participant2Socket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            otherSessionParticipantSocket.once('connect', resolve)
          ),
        ];

        await Promise.all(connectPromises);
      });

      afterEach(async () => {
        await liveSessionFactory.cleanup();

        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Opened => Ready Must_Response_With_400', async () => {
        const transitionCb = jest.fn();

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);

        await transitionPromise;

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(400);

        const _openedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: openedLiveSession.id },
        });

        expect(_openedLiveSession).toBeDefined();
        expect(_openedLiveSession!.status).toEqual(live_session_status.OPENED);
      });

      test('Opened => Opened Must_Response_With_400', async () => {
        const transitionCb = jest.fn();

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);

        await transitionPromise;

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(400);

        const _openedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: openedLiveSession.id },
        });

        expect(_openedLiveSession).toBeDefined();
        expect(_openedLiveSession!.status).toEqual(live_session_status.OPENED);
      });

      test('Opened => Breaked Must_Response_With_200', async () => {
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const organizerUpdatePromise = new Promise((resolve) => {
          organizerSocket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant1UpdatePromise = new Promise((resolve) => {
          participant1Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant2UpdatePromise = new Promise((resolve) => {
          participant2Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);

        await Promise.all([
          organizerUpdatePromise,
          participant1UpdatePromise,
          participant2UpdatePromise,
          transitionPromise,
        ]);

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

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
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const organizerUpdatePromise = new Promise((resolve) => {
          organizerSocket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant1UpdatePromise = new Promise((resolve) => {
          participant1Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant2UpdatePromise = new Promise((resolve) => {
          participant2Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);

        await Promise.all([
          organizerUpdatePromise,
          participant1UpdatePromise,
          participant2UpdatePromise,
          transitionPromise,
        ]);

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

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

      beforeEach(async () => {
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

        const connectPromises = [
          new Promise<void>((resolve) =>
            organizerSocket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            participant1Socket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            participant2Socket.once('connect', resolve)
          ),
          new Promise<void>((resolve) =>
            otherSessionParticipantSocket.once('connect', resolve)
          ),
        ];

        await Promise.all(connectPromises);
      });

      afterEach(() => {
        liveSessionFactory.cleanup();

        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect();
      });

      test('Breaked => Ready Must_Response_With_400', async () => {
        const otherLiveSessionParticipantTransitionListener = jest.fn();
        const transitionCb = jest.fn();

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.transition.broadCast.ready,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.ready, transitionCb);

        await transitionPromise;

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(400);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

        const _breakedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: breakedLiveSession.id },
        });

        expect(_breakedLiveSession).toBeDefined();
        expect(_breakedLiveSession!.status).toEqual(
          live_session_status.BREAKED
        );
      });

      test('Breaked => Opened Must_Response_With_200', async () => {
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const organizerUpdatePromise = new Promise((resolve) => {
          organizerSocket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant1UpdatePromise = new Promise((resolve) => {
          participant1Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const participant2UpdatePromise = new Promise((resolve) => {
          participant2Socket.once(WS_CHANNELS.livesession.update, resolve);
        });

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.open, transitionCb);

        await Promise.all([
          organizerUpdatePromise,
          participant1UpdatePromise,
          participant2UpdatePromise,
          transitionPromise,
        ]);

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

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
        const transitionCb = jest.fn();

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        organizerSocket.emit(WS_CHANNELS.transition.break, transitionCb);

        await transitionPromise;

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(400);

        const _breakedLiveSession = await prismaClient.live_session.findFirst({
          where: { id: breakedLiveSession.id },
        });

        expect(_breakedLiveSession).toBeDefined();
        expect(_breakedLiveSession!.status).toEqual(
          live_session_status.BREAKED
        );
      });

      test('Breaked => Closed Must_Response_With_200', async () => {
        const transitionCb = jest.fn();
        const otherLiveSessionParticipantTransitionListener = jest.fn();

        const organizerUpdatePromise = new Promise((resolve) => {
          organizerSocket.once(WS_CHANNELS.livesession.update, (field) => {
            if (field === 'status') resolve(field);
          });
        });

        const participant1UpdatePromise = new Promise((resolve) => {
          participant1Socket.once(WS_CHANNELS.livesession.update, (field) => {
            if (field === 'status') resolve(field);
          });
        });

        const participant2UpdatePromise = new Promise((resolve) => {
          participant2Socket.once(WS_CHANNELS.livesession.update, (field) => {
            if (field === 'status') resolve(field);
          });
        });

        const transitionPromise = new Promise((resolve) => {
          transitionCb.mockImplementation(resolve);
        });

        otherSessionParticipantSocket.on(
          WS_CHANNELS.livesession.update,
          otherLiveSessionParticipantTransitionListener
        );

        organizerSocket.emit(WS_CHANNELS.transition.close, transitionCb);

        await Promise.all([
          organizerUpdatePromise,
          participant1UpdatePromise,
          participant2UpdatePromise,
          transitionPromise,
        ]);

        expect(transitionCb).toHaveBeenCalled();
        expect(transitionCb.mock.calls[0][0].status).toEqual(httpStatusCode.OK);
        expect(
          otherLiveSessionParticipantTransitionListener
        ).not.toHaveBeenCalled();

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
      });

      test('Must_Connection_Error_Raised_To_Closed_Live_Session', async () => {
        const connectErrorPromise = new Promise((resolve) => {
          organizerSocket = ioc(
            process.env.SERVER_URL +
              `/${closedLiveSession.id}?role=${Role.organizer}`,
            {
              extraHeaders: { userId: organizer.id.toString() },
            }
          );

          organizerSocket.once('connect_error', (err) => {
            resolve(err);
          });
        });

        const err = await connectErrorPromise;

        expect(err).toBeDefined();
        expect(organizerSocket.connected).toBeFalsy();
      });
    });
  });
});
