import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';
import testSessionData from '../data/session.json';
import ioc from 'socket.io-client';
import { Socket as ClientSocket } from 'socket.io-client';
import { httpServer } from '../../src/http';
import { liveSessionStatus } from '../../src/enums/session';
import fs from 'node:fs';
import WS_CHANNELS from '../../src/constants/channels';

describe('Connection', () => {
  afterAll(() => {
    httpServer.close();
  });

  afterAll(async () => {
    await prismaClient.user.deleteMany({});
    await prismaClient.live_session.deleteMany({});
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
      await prismaClient.live_session.create({
        data: liveSession,
      });
    }
  });

  describe('Participant', () => {
    const participant = testUserData.users[1];

    describe('connect to lives session', () => {
      let participantSocket: ClientSocket;

      afterAll(() => {
        if (participantSocket.connected) {
          participantSocket.disconnect();
        }
      });

      test('Connection_Establish', (done) => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${testSessionData.liveSessions[0].id}`,
          {
            extraHeaders: { userId: participant.id.toString() },
          }
        );

        participantSocket.on('connect', () => {
          expect(participantSocket.connected).toBeTruthy();
          done();
        });
      });

      test('Connection_Reject_LiveSession(?)', (done) => {
        participantSocket = ioc(
          process.env.SERVER_URL + `/livesession/not-uuid`,
          {
            extraHeaders: { userId: participant.id.toString() },
          }
        );

        participantSocket.on('connect_error', (err) => {
          expect(err).toBeDefined();
          expect(participantSocket.connected).toBeFalsy();
          done();
        });
      });

      test('Connection_Reject_LiveSession(does_not_exist)', (done) => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            '/livesession/11111111-1111-1111-1111-111111111111',
          {
            extraHeaders: { userId: participant.id.toString() },
          }
        );

        participantSocket.on('connect_error', (err) => {
          expect(err).toBeDefined();
          expect(participantSocket.connected).toBeFalsy();
          done();
        });
      });
    });

    describe('disconnect from liveSession namespace', () => {
      let participantSocket: ClientSocket;

      beforeEach((done) => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${testSessionData.liveSessions[0].id}`,
          {
            extraHeaders: { userId: participant.id.toString() },
          }
        );

        participantSocket.on('connect', () => {
          done();
        });
      });

      afterEach((done) => {
        if (participantSocket.connected) {
          participantSocket.disconnect();
        }

        done();
      });

      // disconnect 후에는 live session의 status가 pause되어야한다.
      test('Disconnect_Should_Pause_Live_Session', async () => {
        participantSocket.disconnect();
        participantSocket.on('disconnect', async () => {
          expect(participantSocket.disconnected);

          const liveSession = await prismaClient.live_session.findFirst({
            where: { id: testSessionData.liveSessions[0].id },
          });

          expect(liveSession).toBeDefined();

          expect(liveSession!.status == liveSessionStatus.opened);
        });
      });
    });

    describe('push live session stream', () => {
      let participantSocket: ClientSocket;

      beforeEach((done) => {
        participantSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${testSessionData.liveSessions[0].id}`,
          {
            extraHeaders: { userId: participant.id.toString() },
          }
        );

        participantSocket.on('connect', () => {
          done();
        });
      });

      afterEach((done) => {
        if (participantSocket.connected) {
          participantSocket.disconnect();
        }

        done();
      });

      test('Participant_Can_Not_Push_Stream', (done) => {
        const cb = jest.fn();
        participantSocket.emit(
          WS_CHANNELS.stream.push,
          fs.readFileSync('tests/video/video.webm'),
          cb
        );

        setTimeout(() => {
          expect(cb).not.toHaveBeenCalled();
          done();
        }, 1000);
      });
    });
  });

  describe('Organizer', () => {
    const organizer = testUserData.currUser;

    describe('connect to liveSession namespace', () => {
      let organizerSocket: ClientSocket;

      afterAll(() => {
        if (organizerSocket.connected) {
          organizerSocket.disconnect();
        }
      });

      test('Connection_Establish', (done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${testSessionData.liveSessions[0].id}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        organizerSocket.on('connect', () => {
          expect(organizerSocket.connected).toBeTruthy();
          done();
        });
      });

      test('Connection_Reject_LiveSession(?)', (done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL + `/livesession/not-uuid`,
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

      test('Connection_Reject_LiveSession(does_not_exist)', (done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            '/livesession/11111111-1111-1111-1111-111111111111',
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

    describe('ffmpeg process', () => {
      let organizerSocket: ClientSocket;

      beforeEach((done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL +
            `/livesession/${testSessionData.liveSessions[0].id}`,
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
        }

        done();
      });

      test('Organizer_Can_Push_Stream', (done) => {
        const cb = jest.fn();

        organizerSocket.emit(
          WS_CHANNELS.stream.push,
          fs.readFileSync('tests/video/video.webm'),
          cb
        );

        setTimeout(() => {
          expect(cb).toHaveBeenCalled();
          done();
        }, 1000);
      });
    });
  });
});
