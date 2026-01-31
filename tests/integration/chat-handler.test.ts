import { httpServer } from '../../src/http';
import testUserData from '../data/user.json';
import prismaClient from '../../src/database/clients/prisma';
import WS_CHANNELS from '../../src/constants/channels';
import { Socket as ClientSocket } from 'socket.io-client';
import ioc from 'socket.io-client';
import { live_session_status } from '@prisma/client';
import { access_level } from '@prisma/client';
import liveSessionFactory from '../factories/live-session-factory';
import { LiveSessionWithAll } from '../../src/@types/liveSession';
import { Role } from '../../src/enums/session';
import currUser from '../data/curr-user';
import { SocketResponse } from '../../src/@types/augmentation/socket/response';

describe('Chat Handler', () => {
  const organizer = currUser;
  const participant1 = testUserData.users[0];
  const participant2 = testUserData.users[1];
  const otherSessionParticipant = testUserData.users[2];

  let breakedLiveSession: LiveSessionWithAll;
  let breakedLiveSession2: LiveSessionWithAll;
  let openedLiveSession: LiveSessionWithAll;

  beforeEach(async () => {
    breakedLiveSession = await liveSessionFactory.createAndSave({
      access_level: access_level.PUBLIC,
      status: live_session_status.BREAKED,
      organizer: {
        connect: { id: organizer.id },
      },
    });

    breakedLiveSession2 = await liveSessionFactory.createAndSave({
      access_level: access_level.PUBLIC,
      status: live_session_status.BREAKED,
      organizer: {
        connect: { id: organizer.id },
      },
    });

    openedLiveSession = await liveSessionFactory.createAndSave({
      access_level: access_level.PUBLIC,
      status: live_session_status.OPENED,
      organizer: {
        connect: { id: organizer.id },
      },
    });
  });

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

  afterEach(async () => {
    await liveSessionFactory.cleanup();
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  afterAll(async () => {
    await currUser.delete();
    await prismaClient.user.deleteMany({});
    await prismaClient.live_session.deleteMany({});
  });

  describe(`BroadCast`, () => {
    let organizerSocket: ClientSocket;
    let participant1Socket: ClientSocket;
    let participant2Socket: ClientSocket;
    let otherSessionParticipantSocket: ClientSocket;

    const connectSockets = async (sessionId: string) => {
      organizerSocket = ioc(
        process.env.SERVER_URL + `/${sessionId}?role=${Role.organizer}`,
        {
          extraHeaders: { userId: organizer.id.toString() },
          forceNew: true,
        }
      );

      participant1Socket = ioc(
        process.env.SERVER_URL + `/${sessionId}?role=${Role.participant}`,
        {
          extraHeaders: { userId: participant1.id.toString() },
          forceNew: true,
        }
      );

      participant2Socket = ioc(
        process.env.SERVER_URL + `/${sessionId}?role=${Role.participant}`,
        {
          extraHeaders: { userId: participant2.id.toString() },
          forceNew: true,
        }
      );

      otherSessionParticipantSocket = ioc(
        process.env.SERVER_URL +
          `/${breakedLiveSession2.id}?role=${Role.participant}`,
        {
          extraHeaders: { userId: otherSessionParticipant.id.toString() },
          forceNew: true,
        }
      );

      await Promise.all([
        new Promise<void>((resolve) => organizerSocket.on('connect', resolve)),
        new Promise<void>((resolve) =>
          participant1Socket.on('connect', resolve)
        ),
        new Promise<void>((resolve) =>
          participant2Socket.on('connect', resolve)
        ),
        new Promise<void>((resolve) =>
          otherSessionParticipantSocket.on('connect', resolve)
        ),
      ]);
    };

    const disconnectAllSockets = async () => {
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
    };

    describe('to breaked live session', () => {
      beforeEach(async () => {
        await connectSockets(breakedLiveSession.id);
      });

      afterEach(async () => {
        await disconnectAllSockets();
      });

      test('Response_200_Organizer_Broadcast', async () => {
        const msg = 'test';

        await new Promise<void>((resolve) => {
          organizerSocket.emit(
            WS_CHANNELS.chat.broadCastSend,
            msg,
            (res: SocketResponse) => {
              expect(res.status).toEqual(200);
              resolve();
            }
          );
        });
      });

      test('Response_200_Participant_Broadcast', async () => {
        const msg = 'test';

        await new Promise<void>((resolve) => {
          participant1Socket.emit(
            WS_CHANNELS.chat.broadCastSend,
            msg,
            (res: SocketResponse) => {
              expect(res.status).toEqual(200);
              resolve();
            }
          );
        });
      });

      test('Broadcasted_Chat_By_The_Organizer_Should_Be_Received_By_All_Participants_In_The_Same_Live_Session', async () => {
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

        otherSessionParticipantSocket.on(
          WS_CHANNELS.chat.broadCastRecive,
          (data) => {
            throw new Error(
              `Other session participant should not receive this message : ${data}`
            );
          }
        );

        const broadCastRecivePromises = [
          new Promise<void>((resolve) => {
            organizerSocket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
              expect(data).toMatchObject(chat);
              resolve();
            });
          }),

          new Promise<void>((resolve) => {
            participant1Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
              expect(data).toMatchObject(chat);
              resolve();
            });
          }),
          new Promise<void>((resolve) => {
            participant2Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
              expect(data).toMatchObject(chat);
              resolve();
            });
          }),
        ];

        await new Promise<void>((resolve) => {
          organizerSocket.emit(WS_CHANNELS.chat.broadCastSend, msg, () => {
            resolve();
          });
        });

        await Promise.all(broadCastRecivePromises);
      });

      test('Broadcasted_Chat_By_The_Participant_Should_Be_Received_By_All_Participants_In_The_Same_Live_Session', async () => {
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

        // 다른 session참가자는 메시지를 받지 못해야한다.
        otherSessionParticipantSocket.on(
          WS_CHANNELS.chat.broadCastRecive,
          (data) => {
            throw new Error(
              `Other session participant should not receive this message : ${data}`
            );
          }
        );

        const broadCastRecivePromises = [
          new Promise<void>((resolve) => {
            organizerSocket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
              expect(data).toMatchObject(chat);
              resolve();
            });
          }),

          new Promise<void>((resolve) => {
            participant1Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
              expect(data).toMatchObject(chat);
              resolve();
            });
          }),

          new Promise<void>((resolve) => {
            participant2Socket.on(WS_CHANNELS.chat.broadCastRecive, (data) => {
              expect(data).toMatchObject(chat);
              resolve();
            });
          }),
        ];

        await new Promise<void>((resolve) => {
          participant1Socket.emit(WS_CHANNELS.chat.broadCastSend, msg, () => {
            resolve();
          });
        });

        await Promise.all(broadCastRecivePromises);
      });
    });

    describe('to opened live session', () => {
      beforeEach(async () => {
        await connectSockets(openedLiveSession.id);
      });

      afterEach(async () => {
        await disconnectAllSockets();
      });

      test('Response_403_Organizer_Broadcast', async () => {
        const msg = 'test';

        await new Promise<void>((resolve) => {
          organizerSocket.emit(
            WS_CHANNELS.chat.broadCastSend,
            msg,
            (res: SocketResponse) => {
              expect(res.status).toEqual(403);
              resolve();
            }
          );
        });
      });

      test('Response_403_Participant_Broadcast', async () => {
        const msg = 'test';

        await new Promise<void>((resolve) => {
          participant1Socket.emit(
            WS_CHANNELS.chat.broadCastSend,
            msg,
            (res: SocketResponse) => {
              expect(res.status).toEqual(403);
              resolve();
            }
          );
        });
      });
    });
  });
});
