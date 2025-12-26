import { OrganizerLiveSession } from '../../src/lib/liveSession/live-session';
import { LiveSessionWithAll } from '../../src/@types/liveSession';
import { $Enums } from '@prisma/client';
import { getNameSpace } from '../../src/socket.io';
import WS_CHANNELS from '../../src/constants/channels';
import { prismaMock } from '../jest/setup/singleton';

jest.mock('../../src/socket.io');
const mockGetNameSpace = getNameSpace as jest.MockedFunction<
  typeof getNameSpace
>;

describe('OrganizerLiveSession', () => {
  const mockLiveSessionData: LiveSessionWithAll = {
    id: 'test-session-id',
    title: 'Test Live Session',
    description: 'Test Description',
    thumbnail_uri: 'test-thumbnail.jpg',
    status: $Enums.live_session_status.READY,
    stream_key: 'test-stream-key',
    access_level: $Enums.access_level.PUBLIC,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    started_at: null,
    organizer_id: 1,
    category_label: 'gaming',
    organizer: {
      id: 1,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
      username: 'testuser',
      encrypted_password: 'encrypted',
      email: 'test@example.com',
      followers_count: 100,
      followings_count: 50,
    },
    allow: [],
    break_time: null,
    live_session_transition_log: [],
    category: { label: 'gaming' },
  };

  const mockNamespace = {
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNameSpace.mockReturnValue(mockNamespace as any);
  });

  describe('create', () => {
    test('Should_Create_An_OrganizerLiveSession_Instance', async () => {
      const liveSessionId = 'test-session-id';
      prismaMock.live_session.findUnique.mockResolvedValue(mockLiveSessionData);

      const result = await OrganizerLiveSession.create(liveSessionId);

      expect(prismaMock.live_session.findUnique).toHaveBeenCalledWith({
        where: { id: liveSessionId },
        include: {
          organizer: true,
          allow: true,
          break_time: true,
          live_session_transition_log: true,
          category: true,
        },
      });
      expect(result).toBeInstanceOf(OrganizerLiveSession);
      expect(result.id).toBe(liveSessionId);
    });

    test('Should_Throw_Error_When_Live_Session_Not_Found', async () => {
      const liveSessionId = 'non-existent-id';
      prismaMock.live_session.findUnique.mockResolvedValue(null);

      await expect(OrganizerLiveSession.create(liveSessionId)).rejects.toThrow(
        `Live session with id ${liveSessionId} not found`
      );
    });
  });

  describe('touch', () => {
    test('Should_Update_LastActivity_And_Call_Open_When_Status_Is_READY', async () => {
      const session = new OrganizerLiveSession({
        ...mockLiveSessionData,
        status: $Enums.live_session_status.READY,
      });
      const openSpy = jest.spyOn(session, 'open').mockResolvedValue();

      await session.touch();

      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(openSpy).toHaveBeenCalled();
    });

    test('Should_Update_LastActivity_When_Status_Is_OPENED', async () => {
      const session = new OrganizerLiveSession({
        ...mockLiveSessionData,
        status: $Enums.live_session_status.OPENED,
      });
      const openSpy = jest.spyOn(session, 'open');

      await session.touch();

      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(openSpy).not.toHaveBeenCalled();
    });

    test('Should_Throw_Error_When_Session_Is_CLOSED', async () => {
      const session = new OrganizerLiveSession({
        ...mockLiveSessionData,
        status: $Enums.live_session_status.CLOSED,
      });

      await expect(session.touch()).rejects.toThrow('Live session is closed.');
    });
  });

  describe('status transition methods', () => {
    let session: OrganizerLiveSession;

    beforeEach(() => {
      session = new OrganizerLiveSession(mockLiveSessionData);
    });

    describe('start', () => {
      test('Should_Update_Started_At_In_Database', async () => {
        const updateData = { started_at: expect.any(Date) };
        prismaMock.live_session.update.mockResolvedValue({
          ...mockLiveSessionData,
          started_at: new Date(),
        });

        await session.start();

        expect(prismaMock.live_session.update).toHaveBeenCalledWith({
          where: { id: session.id },
          data: updateData,
        });
        expect(mockNamespace.emit).toHaveBeenCalledWith(
          WS_CHANNELS.livesession.update,
          'started_at'
        );
      });
    });

    describe('open', () => {
      test('Should_Update_Status_To_OPENED_When_From_READY', async () => {
        session.status = $Enums.live_session_status.READY;
        const updatedData = {
          ...mockLiveSessionData,
          status: $Enums.live_session_status.OPENED,
        };

        prismaMock.live_session.update.mockResolvedValue(updatedData);
        prismaMock.live_session.findUnique.mockResolvedValue(updatedData);

        await session.open();

        expect(prismaMock.live_session.update).toHaveBeenCalledWith({
          where: { id: session.id },
          data: { status: $Enums.live_session_status.OPENED },
        });
        expect(prismaMock.live_session.findUnique).toHaveBeenCalledWith({
          where: { id: session.id },
          include: {
            organizer: true,
            allow: true,
            break_time: true,
            live_session_transition_log: true,
            category: true,
          },
        });
        expect(session.status).toBe($Enums.live_session_status.OPENED);
        expect(mockNamespace.emit).toHaveBeenCalledWith(
          WS_CHANNELS.livesession.update,
          'status'
        );
      });

      test('Should_Update_Status_To_OPENED_When_From_BREAKED', async () => {
        session.status = $Enums.live_session_status.BREAKED;
        const updatedData = {
          ...mockLiveSessionData,
          status: $Enums.live_session_status.OPENED,
        };

        prismaMock.live_session.update.mockResolvedValue(updatedData);
        prismaMock.live_session.findUnique.mockResolvedValue(updatedData);

        await session.open();

        expect(prismaMock.live_session.update).toHaveBeenCalledWith({
          where: { id: session.id },
          data: { status: $Enums.live_session_status.OPENED },
        });
        expect(session.status).toBe($Enums.live_session_status.OPENED);
      });

      test('Should_Throw_Error_When_Not_Openable', async () => {
        session.status = $Enums.live_session_status.CLOSED;

        await expect(session.open()).rejects.toThrow(
          `Live session cannot be opened from ${session.status}`
        );
      });
    });

    describe('break', () => {
      test('Should_Update_Status_To_BREAKED_When_From_OPENED', async () => {
        session.status = $Enums.live_session_status.OPENED;
        const updatedData = {
          ...mockLiveSessionData,
          status: $Enums.live_session_status.BREAKED,
        };

        prismaMock.live_session.update.mockResolvedValue(updatedData);
        prismaMock.live_session.findUnique.mockResolvedValue(updatedData);

        await session.break();

        expect(prismaMock.live_session.update).toHaveBeenCalledWith({
          where: { id: session.id },
          data: { status: $Enums.live_session_status.BREAKED },
        });
        expect(session.status).toBe($Enums.live_session_status.BREAKED);
        expect(mockNamespace.emit).toHaveBeenCalledWith(
          WS_CHANNELS.livesession.update,
          'status'
        );
      });

      test('Should_Throw_Error_When_Not_Breakable', async () => {
        session.status = $Enums.live_session_status.READY;

        await expect(session.break()).rejects.toThrow(
          `Live session cannot be breaked from ${session.status}`
        );
      });
    });

    describe('close', () => {
      test('Should_Update_Status_To_CLOSED_When_From_OPENED', async () => {
        session.status = $Enums.live_session_status.OPENED;
        const updatedData = {
          ...mockLiveSessionData,
          status: $Enums.live_session_status.CLOSED,
        };

        prismaMock.live_session.update.mockResolvedValue(updatedData);
        prismaMock.live_session.findUnique.mockResolvedValue(updatedData);

        await session.close();

        expect(prismaMock.live_session.update).toHaveBeenCalledWith({
          where: { id: session.id },
          data: { status: $Enums.live_session_status.CLOSED },
        });
        expect(session.status).toBe($Enums.live_session_status.CLOSED);
        expect(mockNamespace.emit).toHaveBeenCalledWith(
          WS_CHANNELS.livesession.update,
          'status'
        );
      });

      test('Should_Throw_Error_When_Not_Closeable', async () => {
        session.status = $Enums.live_session_status.CLOSED;

        await expect(session.close()).rejects.toThrow(
          `Live session cannot be closed from ${session.status}`
        );
      });
    });
  });

  describe('validation methods', () => {
    let session: OrganizerLiveSession;

    beforeEach(() => {
      session = new OrganizerLiveSession(mockLiveSessionData);
    });

    describe('isActivate', () => {
      test('Should_Return_True_For_OPENED_Status', () => {
        session.status = $Enums.live_session_status.OPENED;
        expect(session.isActivate()).toBe(true);
      });

      test('Should_Return_True_For_BREAKED_Status', () => {
        session.status = $Enums.live_session_status.BREAKED;
        expect(session.isActivate()).toBe(true);
      });

      test('Should_Return_False_For_Other_Statuses', () => {
        session.status = $Enums.live_session_status.READY;
        expect(session.isActivate()).toBe(false);

        session.status = $Enums.live_session_status.CLOSED;
        expect(session.isActivate()).toBe(false);
      });
    });

    describe('isOpenable', () => {
      test('Should_Return_True_For_READY_Status', () => {
        session.status = $Enums.live_session_status.READY;
        expect(session.isOpenable()).toBe(true);
      });

      test('Should_Return_True_For_BREAKED_Status', () => {
        session.status = $Enums.live_session_status.BREAKED;
        expect(session.isOpenable()).toBe(true);
      });

      test('Should_Return_False_For_Other_Statuses', () => {
        session.status = $Enums.live_session_status.OPENED;
        expect(session.isOpenable()).toBe(false);

        session.status = $Enums.live_session_status.CLOSED;
        expect(session.isOpenable()).toBe(false);
      });
    });

    describe('isBreakable', () => {
      test('Should_Return_True_For_OPENED_Status', () => {
        session.status = $Enums.live_session_status.OPENED;
        expect(session.isBreakable()).toBe(true);
      });

      test('Should_Return_False_For_Other_Statuses', () => {
        session.status = $Enums.live_session_status.READY;
        expect(session.isBreakable()).toBe(false);

        session.status = $Enums.live_session_status.BREAKED;
        expect(session.isBreakable()).toBe(false);

        session.status = $Enums.live_session_status.CLOSED;
        expect(session.isBreakable()).toBe(false);
      });
    });

    describe('isCloseable', () => {
      test('Should_Return_True_For_READY_OPENED_BREAKED_Statuses', () => {
        session.status = $Enums.live_session_status.READY;
        expect(session.isCloseable()).toBe(true);

        session.status = $Enums.live_session_status.OPENED;
        expect(session.isCloseable()).toBe(true);

        session.status = $Enums.live_session_status.BREAKED;
        expect(session.isCloseable()).toBe(true);
      });

      test('Should_Return_False_For_CLOSED_Status', () => {
        session.status = $Enums.live_session_status.CLOSED;
        expect(session.isCloseable()).toBe(false);
      });
    });

    describe('isReadyable', () => {
      test('Should_Always_Return_False', () => {
        expect(session.isReadyable()).toBe(false);
      });
    });
  });

  describe('notifyUpdate', () => {
    test('Should_Emit_Update_Event_With_Specified_Field', async () => {
      const session = new OrganizerLiveSession(mockLiveSessionData);
      const field = 'status';

      await session.notifyUpdate(field);

      expect(mockNamespace.emit).toHaveBeenCalledWith(
        WS_CHANNELS.livesession.update,
        field
      );
    });
  });

  describe('decorators', () => {
    describe('sync decorator', () => {
      test('Should_Sync_Data_After_Method_Execution', async () => {
        const session = new OrganizerLiveSession(mockLiveSessionData);
        const updatedData = {
          ...mockLiveSessionData,
          status: $Enums.live_session_status.OPENED,
          updated_at: new Date('2024-01-02'),
        };

        prismaMock.live_session.update.mockResolvedValue(updatedData);
        prismaMock.live_session.findUnique.mockResolvedValue(updatedData);

        await session.open();

        expect(prismaMock.live_session.update).toHaveBeenCalled();
        expect(prismaMock.live_session.findUnique).toHaveBeenCalledWith({
          where: { id: session.id },
          include: {
            organizer: true,
            allow: true,
            break_time: true,
            live_session_transition_log: true,
            category: true,
          },
        });
        expect(session.status).toBe($Enums.live_session_status.OPENED);
      });

      test('Should_Handle_Sync_Error_Gracefully', async () => {
        const session = new OrganizerLiveSession(mockLiveSessionData);
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation();

        prismaMock.live_session.update.mockResolvedValue(mockLiveSessionData);
        prismaMock.live_session.findUnique.mockRejectedValue(
          new Error('DB Error')
        );

        await session.open();

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(prismaMock.live_session.update).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });
    });

    describe('notifyUpdate decorator', () => {
      test('Should_Call_NotifyUpdate_After_Method_Execution', async () => {
        const session = new OrganizerLiveSession(mockLiveSessionData);
        const notifyUpdateSpy = jest.spyOn(session, 'notifyUpdate');

        const updatedData = {
          ...mockLiveSessionData,
          status: $Enums.live_session_status.OPENED,
        };

        prismaMock.live_session.update.mockResolvedValue(updatedData);
        prismaMock.live_session.findUnique.mockResolvedValue(updatedData);

        await session.open();

        expect(notifyUpdateSpy).toHaveBeenCalledWith('status');
      });
    });
  });
});
