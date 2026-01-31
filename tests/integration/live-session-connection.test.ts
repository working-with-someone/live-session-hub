import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';
import ioc from 'socket.io-client';
import { Socket as ClientSocket } from 'socket.io-client';
import { httpServer } from '../../src/http';
import { live_session_status } from '@prisma/client';
import fs from 'node:fs';
import WS_CHANNELS from '../../src/constants/channels';
import { access_level } from '@prisma/client';
import liveSessionFactory from '../factories/live-session-factory';
import { Role } from '../../src/enums/session';
import { LiveSessionWithAll } from '../../src/@types/liveSession';
import currUser from '../data/curr-user';
import liveSessionPool from '../../src/lib/liveSession/pool';

describe('Connection', () => {
  beforeAll(async () => {
    await currUser.insert();

    for (const user of testUserData.users) {
      await prismaClient.user.create({
        data: {
          ...user,
          pfp: {},
        },
      });
    }
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  afterAll(async () => {
    await currUser.delete();

    // transition log생성
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 잠시 대기

    await prismaClient.user.deleteMany({});
    await prismaClient.live_session.deleteMany({});
  });

  describe('Participant', () => {
    const participant = testUserData.users[1];

    describe('connect to live session', () => {
      let openedLiveSession: LiveSessionWithAll;
      let participantSocket: ClientSocket;

      beforeEach(async () => {
        openedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.OPENED,
          organizer: {
            connect: { id: currUser.id },
          },
        });
      });

      afterEach(async () => {
        if (participantSocket.connected) {
          const disconnectPromise = new Promise((resolve, reject) =>
            participantSocket.on('disconnect', resolve)
          );

          participantSocket.disconnect();

          await disconnectPromise;
        }
      });

      test('Connection_Establish', async () => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            `/${openedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant.id.toString() },
            forceNew: true,
          }
        );

        const connectPromise = new Promise<void>((resolve, reject) => {
          participantSocket.on('connect', resolve);
        });

        await connectPromise;

        expect(participantSocket.connected).toBeTruthy();
      });

      test('Connection_Reject_LiveSession(?)', async () => {
        participantSocket = ioc(
          process.env.SERVER_URL + `/not-uuid?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant.id.toString() },
            forceNew: true,
          }
        );

        const connectErrorPromise = new Promise((resolve) =>
          participantSocket.on('connect_error', resolve)
        );

        await connectErrorPromise;
        expect(participantSocket.connected).toBeFalsy();
      });

      test('Connection_Reject_LiveSession(does_not_exist)', async () => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            `/11111111-1111-1111-1111-111111111111?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant.id.toString() },
            forceNew: true,
          }
        );

        const connectErrorPromise = new Promise((resolve) =>
          participantSocket.on('connect_error', resolve)
        );

        await connectErrorPromise;
        expect(participantSocket.connected).toBeFalsy();
      });
    });

    describe('disconnect from liveSession namespace', () => {
      let openedLiveSession: LiveSessionWithAll;
      let participantSocket: ClientSocket;

      beforeEach(async () => {
        openedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.OPENED,
          organizer: {
            connect: { id: currUser.id },
          },
        });
      });

      beforeEach(async () => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            `/${openedLiveSession.id}?role=${Role.participant}`,
          {
            extraHeaders: { userId: participant.id.toString() },
            forceNew: true,
          }
        );

        const connectPromise = new Promise<void>((resolve, reject) =>
          participantSocket.on('connect', resolve)
        );

        await connectPromise;
      });

      afterEach(async () => {
        if (participantSocket.connected) {
          participantSocket.disconnect();

          const disconnectPromise = new Promise((resolve, reject) =>
            participantSocket.on('diosconnect', resolve)
          );

          await disconnectPromise;
        }
      });

      // participant의 disconnect는 live session의 status에 아무런 영향을 미치지 않아야한다.
      test('Disconnect_To_Live_Session', async () => {
        participantSocket.on('disconnect', async () => {
          const liveSession = await prismaClient.live_session.findFirst({
            where: { id: openedLiveSession.id },
          });

          expect(liveSession).toBeDefined();
          expect(liveSession!.status).toEqual(live_session_status.OPENED);
        });

        participantSocket.disconnect();
      });
    });
  });

  describe('Organizer', () => {
    const organizer = currUser;

    describe('connect to liveSession namespace', () => {
      let openedLiveSession: LiveSessionWithAll;
      let organizerSocket: ClientSocket;

      beforeEach(async () => {
        openedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.OPENED,
          organizer: {
            connect: { id: currUser.id },
          },
        });
      });

      afterEach(async () => {
        if (organizerSocket.connected) {
          organizerSocket.disconnect();
        }
      });

      test('Connection_Establish', async () => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/${openedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
            forceNew: true,
          }
        );

        const connectPromise = new Promise<void>((resolve, reject) => {
          organizerSocket.on('connect', resolve);
        });

        await connectPromise;

        expect(organizerSocket.connected).toBeTruthy();
        expect(liveSessionPool.get(openedLiveSession.id)).toBeDefined();
      });

      test('Connection_Reject_LiveSession(?)', async () => {
        organizerSocket = ioc(
          process.env.SERVER_URL + `/not-uuid?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
            forceNew: true,
          }
        );

        const connectErrorPromise = new Promise((resolve, reject) => {
          organizerSocket.on('connect_error', resolve);
        });

        await connectErrorPromise;

        expect(organizerSocket.connected).toBeFalsy();
        expect(liveSessionPool.get(openedLiveSession.id)).toBeUndefined();
      });

      test('Connection_Reject_LiveSession(does_not_exist)', async () => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/11111111-1111-1111-1111-111111111111?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
            forceNew: true,
          }
        );

        const connectErrorPromise = new Promise((resolve, reject) => {
          organizerSocket.on('connect_error', resolve);
        });

        await connectErrorPromise;

        expect(organizerSocket.connected).toBeFalsy();
        expect(liveSessionPool.get(openedLiveSession.id)).toBeUndefined();
      });
    });

    // socket이 live session으로부터 disconnect된다면, live session은 close되어야한다.
    describe('disconnect to liveSession namespace', () => {
      let openedLiveSession: LiveSessionWithAll;
      let organizerSocket: ClientSocket;

      beforeEach(async () => {
        openedLiveSession = await liveSessionFactory.createAndSave({
          access_level: access_level.PUBLIC,
          status: live_session_status.OPENED,
          organizer: {
            connect: { id: currUser.id },
          },
        });
      });

      afterEach(async () => {
        if (organizerSocket.connected) {
          organizerSocket.disconnect();

          const disconnectPromise = new Promise((resolve, reject) => resolve);

          await disconnectPromise;
        }
      });

      test('Disconnect_To_Opened_Live_Session', async () => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/${openedLiveSession.id}?role=${Role.organizer}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
            forceNew: true,
          }
        );

        const connectionPromise = new Promise<void>((resolve, reject) =>
          organizerSocket.on('connect', resolve)
        );

        await connectionPromise;

        expect(organizerSocket.connected).toBeTruthy();

        const disconnectPromise = new Promise((resolve, reject) => {
          organizerSocket.on('disconnect', resolve);
        });

        organizerSocket.disconnect();

        await disconnectPromise;

        expect(organizerSocket.disconnected).toBeTruthy();
      });
    });
  });
});
