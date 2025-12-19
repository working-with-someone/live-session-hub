import { $Enums, live_session_status } from '@prisma/client';
import prismaClient from '../../database/clients/prisma';
import { LiveSessionWithAll } from '../../@types/liveSession';
import { Namespace } from 'socket.io';
import WS_CHANNELS from '../../constants/channels';
import { getNameSpace, getSocketIoServer } from '../../socket.io';

export class LiveSession implements LiveSessionWithAll {
  id: string;
  title: string;
  description: string | null;
  thumbnail_uri: string;
  status: $Enums.live_session_status;
  stream_key: string;
  access_level: $Enums.access_level;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  organizer_id: number;
  category_label: string;
  lastActivity: Date | null;
  organizer: {
    id: number;
    created_at: Date;
    updated_at: Date;
    username: string;
    encrypted_password: string;
    email: string;
    followers_count: number;
    followings_count: number;
  };
  allow: { user_id: number; live_session_id: string }[];
  break_time: { session_id: string; interval: number; duration: number } | null;
  live_session_transition_log: {
    id: number;
    live_session_id: string;
    from_state: $Enums.live_session_status;
    to_state: $Enums.live_session_status;
    transitioned_at: Date;
  }[];
  category: { label: string };

  constructor(data: LiveSessionWithAll) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.thumbnail_uri = data.thumbnail_uri;
    this.status = data.status;
    this.stream_key = data.stream_key;
    this.access_level = data.access_level;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.started_at = data.started_at;
    this.organizer_id = data.organizer_id;
    this.category_label = data.category_label;
    this.lastActivity = null;

    this.organizer = data.organizer;
    this.allow = data.allow;
    this.break_time = data.break_time;
    this.live_session_transition_log = data.live_session_transition_log;
    this.category = data.category;
  }
}

export class ParticipantLiveSession extends LiveSession {
  constructor(data: LiveSessionWithAll) {
    super(data);
  }

  static async create(liveSessionId: string): Promise<ParticipantLiveSession> {
    const data = await prismaClient.live_session.findUnique({
      where: { id: liveSessionId },
      include: {
        organizer: true,
        allow: true,
        break_time: true,
        live_session_transition_log: true,
        category: true,
      },
    });

    if (!data) {
      throw new Error(`Live session with id ${liveSessionId} not found`);
    }

    return new ParticipantLiveSession(data);
  }
}

export class OrganizerLiveSession extends LiveSession {
  nextOpenTime?: Date;
  nextBreakTime?: Date;
  nsp: Namespace;

  constructor(data: LiveSessionWithAll) {
    super(data);
    this.nsp = getNameSpace(data.id);
  }

  static async create(liveSessionId: string): Promise<OrganizerLiveSession> {
    const data = await prismaClient.live_session.findUnique({
      where: { id: liveSessionId },
      include: {
        organizer: true,
        allow: true,
        break_time: true,
        live_session_transition_log: true,
        category: true,
      },
    });

    if (!data) {
      throw new Error(`Live session with id ${liveSessionId} not found`);
    }

    return new OrganizerLiveSession(data);
  }

  // ready, opened, breaked live session만이 touch가 가능하다.
  async touch() {
    if (this.status === live_session_status.CLOSED) {
      throw new Error('Live session is closed.');
    }

    // touch는 media push가 발생했을 때 call되며, live session이 ready라면 open status로 변환해줘야한다.
    if (this.status === live_session_status.READY) {
      await this.open();
    }

    this.lastActivity = new Date();
  }

  // started_at을 기록한다.
  async start() {
    await prismaClient.live_session.update({
      where: { id: this.id },
      data: {
        started_at: new Date(),
      },
    });
  }

  async ready() {
    if (!this.isReadyable()) {
      throw new Error(`Live session cannot be ready from ${this.status} `);
    }
  }

  async open() {
    if (!this.isOpenable()) {
      throw new Error(`Live session cannot be opened from ${this.status} `);
    }

    await prismaClient.live_session.update({
      where: { id: this.id },
      data: { status: $Enums.live_session_status.OPENED },
    });

    this.nsp.emit(WS_CHANNELS.transition.broadCast.open);
  }

  async break() {
    if (!this.isBreakable()) {
      throw new Error(`Live session cannot be breaked from ${this.status} `);
    }

    await prismaClient.live_session.update({
      where: { id: this.id },
      data: { status: $Enums.live_session_status.BREAKED },
    });

    this.nsp.emit(WS_CHANNELS.transition.broadCast.break);
  }

  async close() {
    if (!this.isCloseable()) {
      throw new Error(`Live session cannot be closed from ${this.status} `);
    }

    await prismaClient.live_session.update({
      where: { id: this.id },
      data: { status: $Enums.live_session_status.CLOSED },
    });

    this.nsp.emit(WS_CHANNELS.transition.broadCast.close);
  }

  isActivate() {
    return (
      this.status === live_session_status.OPENED ||
      this.status === live_session_status.BREAKED
    );
  }

  // x => ready
  isReadyable() {
    return false;
  }

  // ready, opened, breaked => opened
  isOpenable() {
    return (
      this.status === live_session_status.BREAKED ||
      this.status === live_session_status.READY
    );
  }

  // opened => breaked
  isBreakable() {
    return this.status === live_session_status.OPENED;
  }

  // ready, opened, breaked => closed
  isCloseable() {
    return (
      this.status === live_session_status.READY ||
      this.status === live_session_status.OPENED ||
      this.status === live_session_status.BREAKED
    );
  }
}
