import { httpServer } from '../../src/http';
import testUserData from '../data/user.json';
import prismaClient from '../../src/database/clients/prisma';
import WS_CHANNELS from '../../src/constants/channels';
import { Socket as ClientSocket } from 'socket.io-client';
import ioc from 'socket.io-client';
import {
  CreatedTestLiveSession,
  createTestLiveSession,
} from '../data/live-session';
import { accessLevel, liveSessionStatus } from '../../src/enums/session';

describe('Chat Handler', () => {
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

  describe(`BroadCast`, () => {
    let organizer = testUserData.currUser;
    let participant1 = testUserData.users[1];
    let participant2 = testUserData.users[2];
    let otherSessionParticipant = testUserData.users[3]; // New participant for a different session

    let organizerSocket: ClientSocket;
    let participant1Socket: ClientSocket;
    let participant2Socket: ClientSocket;
    let otherSessionParticipantSocket: ClientSocket; // Socket for the new participant

    describe('to opened live session', () => {
      let openedLiveSession: CreatedTestLiveSession;
      let openedLiveSession2: CreatedTestLiveSession;

      beforeAll(async () => {
        openedLiveSession = await createTestLiveSession({
          access_level: accessLevel.public,
          status: liveSessionStatus.opened,
          organizer_id: organizer.id,
        });

        openedLiveSession2 = await createTestLiveSession({
          access_level: accessLevel.public,
          status: liveSessionStatus.opened,
          organizer_id: organizer.id,
        });
      });

      afterAll(async () => {
        await prismaClient.live_session.deleteMany({});
      });

      beforeEach((done) => {
        organizerSocket = ioc(
          process.env.SERVER_URL + `/livesession/${openedLiveSession.id}`,
          {
            extraHeaders: { userId: organizer.id.toString() },
          }
        );

        participant1Socket = ioc(
          process.env.SERVER_URL + `/livesession/${openedLiveSession.id}`,
          {
            extraHeaders: { userId: participant1.id.toString() },
          }
        );

        participant2Socket = ioc(
          process.env.SERVER_URL + `/livesession/${openedLiveSession.id}`,
          {
            extraHeaders: { userId: participant2.id.toString() },
          }
        );

        otherSessionParticipantSocket = ioc(
          process.env.SERVER_URL + `/livesession/${openedLiveSession2.id}`,
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
        otherSessionParticipantSocket.on('connect', onConnect); // Listen for the new participant's connection
      });

      afterEach(() => {
        organizerSocket.disconnect();
        participant1Socket.disconnect();
        participant2Socket.disconnect();
        otherSessionParticipantSocket.disconnect(); // Disconnect the new participant
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

      test('Broadcasted_Chat_By_The_Organizer_Should_Be_Received_By_All_Participants_In_The_Live_Session', (done) => {
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
        const expectedReceiveCount = 3; // Only 3 participants should receive the message

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

        // Ensure the other session participant does not receive the message
        otherSessionParticipantSocket.on(
          WS_CHANNELS.chat.broadCastRecive,
          (data) => {
            done(
              new Error(
                'Other session participant should not receive this message'
              )
            );
          }
        );

        organizerSocket.emit(WS_CHANNELS.chat.broadCastSend, msg, jest.fn());
      });

      test('Broadcasted_Chat_By_The_Participant_Should_Be_Received_By_All_Participants_In_The_Live_Session', (done) => {
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
        const expectedReceiveCount = 3; // Only 3 participants should receive the message

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

        // Ensure the other session participant does not receive the message
        otherSessionParticipantSocket.on(
          WS_CHANNELS.chat.broadCastRecive,
          (data) => {
            done(
              new Error(
                'Other session participant should not receive this message'
              )
            );
          }
        );

        participant1Socket.emit(WS_CHANNELS.chat.broadCastSend, msg, jest.fn());
      });
    });
  });
});
