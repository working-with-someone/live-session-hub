import { httpServer } from '../../src/http';
import prismaClient from '../../src/database/clients/prisma';
import testUserData from '../data/user.json';
import currUser from '../data/curr-user';
import ioc, { Socket as ClientSocket } from 'socket.io-client';
import liveSessionFactory from '../factories/live-session-factory';
import { live_session_status } from '@prisma/client';
import { LiveSessionWithAll } from '../../src/@types/liveSession';
import { Role } from '../../src/enums/session';
import WS_CHANNELS from '../../src/constants/channels';
import {
  ResponseCb,
  SocketResponse,
} from '../../src/@types/augmentation/socket/response';

describe('Streaming ', () => {
  beforeAll(async () => {
    await currUser.insert();

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

  afterAll(async () => {
    await currUser.delete();
    await prismaClient.user.deleteMany();
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  describe('Live_Session_Owner_Media_Stream_push', () => {
    let organizer = currUser;
    let participant1 = testUserData.users[1];
    let participant2 = testUserData.users[2];
    let otherSessionParticipant = testUserData.users[3]; // New participant for a different session

    let organizerSocket: ClientSocket;
    let participant1Socket: ClientSocket;
    let participant2Socket: ClientSocket;
    let otherSessionParticipantSocket: ClientSocket; // Socket for the new participant

    describe('Ready_Live_Session', () => {
      let readyLiveSession: LiveSessionWithAll;

      beforeAll(async () => {
        readyLiveSession = await liveSessionFactory.createAndSave({
          status: live_session_status.READY,
          organizer: {
            connect: {
              id: organizer.id,
            },
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

        let connectedCount = 0;

        const onConnect = () => {
          connectedCount++;
          if (connectedCount === 1) {
            done();
          }
        };

        organizerSocket.on('connect', onConnect);
      });

      afterEach(() => {
        organizerSocket.disconnect();
      });

      test('Must_Response_400', (done) => {
        const fakeMediaData = new Blob(['fake_media_data'], {
          type: 'video/webm',
        });

        organizerSocket.emit('greet', () => {
          console.log("let's greet");
        });

        organizerSocket.emit(
          WS_CHANNELS.transition.open,
          (res: SocketResponse) => {
            console.log('response : ', res);
          }
        );

        organizerSocket.emit(
          WS_CHANNELS.stream.push,
          fakeMediaData,
          (res: SocketResponse) => {
            console.log('response : ', res);

            expect(res.status).toBe(400);

            done();
          }
        );
      });
    });
  });
});
