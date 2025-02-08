import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';
import testSessionData from '../data/session.json';
import ioc from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { httpServer } from '../../src/http';
import { liveSessionStatus } from '../../src/enums/session';

describe('Connection', () => {
  afterAll(() => {
    httpServer.close();
  });

  afterAll(async () => {
    await prismaClient.user.deleteMany({});
    await prismaClient.session.deleteMany({});
  });

  beforeAll(async () => {
    for (let user of testUserData.users) {
      await prismaClient.user.create({
        data: {
          ...user,
          pfp: {},
        },
      });
    }
  });

  describe('connect to liveSession namespace', () => {
    let clientSocket: ClientSocket;

    beforeAll(async () => {
      for (let liveSession of testSessionData.liveSessions) {
        await prismaClient.session.create({
          data: {
            ...liveSession,
            session_live: {
              create: {
                ...liveSession.session_live,
              },
            },
          },
        });
      }
    });

    afterAll(() => {
      if (clientSocket.connected) {
        clientSocket.disconnect();
      }
    });

    test('Connection_Establish', (done) => {
      clientSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${testSessionData.liveSessions[0].id}`
      );

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBeTruthy();
        done();
      });
    });

    test('Connection_Reject_LiveSession(?)', (done) => {
      clientSocket = ioc(process.env.SERVER_URL + `/livesession/not-uuid`);

      clientSocket.on('connect_error', (err) => {
        expect(err).toBeDefined();
        expect(clientSocket.connected).toBeFalsy();
        done();
      });
    });

    test('Connection_Reject_LiveSession(does_not_exist)', (done) => {
      clientSocket = ioc(
        process.env.SERVER_URL +
          '/livesession/11111111-1111-1111-1111-111111111111'
      );

      clientSocket.on('connect_error', (err) => {
        expect(err).toBeDefined();
        expect(clientSocket.connected).toBeFalsy();
        done();
      });
    });
  });

  describe('disconnect from liveSession namespace', () => {
    let clientSocket: ClientSocket;

    // connect
    beforeEach((done) => {
      clientSocket = ioc(
        process.env.SERVER_URL +
          `/livesession/${testSessionData.liveSessions[0].id}`
      );

      clientSocket.on('connect', () => {
        done();
      });

      clientSocket.on('connect_error', done);
    });

    // disconnect if still connected
    afterEach((done) => {
      if (clientSocket.connected) {
        clientSocket.disconnect();
      }

      done();
    });

    // organizer의 socket이 disconnect시, live session의 status가 paused로 update되는데 이를 복구한다.
    afterEach(async () => {
      for (const liveSession of testSessionData.liveSessions) {
        await prismaClient.session.update({
          data: {
            ...liveSession,
            session_live: {
              update: {
                data: liveSession.session_live,
              },
            },
          },
          where: {
            id: liveSession.id,
          },
        });
      }
    });

    // disconnect 후에는 live session의 status가 pause되어야한다.
    test('Disconnect_Should_Pause_Live_Session', async () => {
      clientSocket.disconnect();
      clientSocket.on('disconnect', async () => {
        expect(clientSocket.disconnected);

        const sessionLive = await prismaClient.session_live.findFirst({
          where: { session_id: testSessionData.liveSessions[0].id },
        });

        expect(sessionLive).toBeDefined();

        expect(sessionLive!.status == liveSessionStatus.paused);
      });
    });
  });
});
