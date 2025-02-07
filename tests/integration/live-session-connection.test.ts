import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';
import testSessionData from '../data/session.json';
import ioc from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { httpServer } from '../../src/http';

describe('Connection', () => {
  let clientSocket: ClientSocket;
  afterAll(() => {
    httpServer.close();
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

  afterAll(async () => {
    await prismaClient.user.deleteMany({});
    await prismaClient.session.deleteMany({});
    clientSocket.disconnect();
  });

  describe('connect to liveSession namespace', () => {
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
});
