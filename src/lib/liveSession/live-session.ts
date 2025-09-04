import { $Enums, live_session_status, Prisma } from '@prisma/client';
import prismaClient from '../../database/clients/prisma';

export class LiveSession implements Prisma.live_sessionGetPayload<{}> {
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

  constructor(data: Prisma.live_sessionGetPayload<{}>) {
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
  }
}

export class ParticipantLiveSession extends LiveSession {
  constructor(data: Prisma.live_sessionGetPayload<{}>) {
    super(data);
  }
}

export class OrganizerLiveSession extends LiveSession {
  constructor(data: Prisma.live_sessionGetPayload<{}>) {
    super(data);
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

  async ready() {
    if (!this.isReadyable()) {
      throw new Error('Live session cannot be ready from current state.');
    }
  }

  async open() {
    if (!this.isOpenable()) {
      throw new Error('Live session cannot be opened from current state.');
    }

    await prismaClient.live_session.update({
      where: { id: this.id },
      data: { status: $Enums.live_session_status.OPENED },
    });
  }

  async break() {
    if (!this.isBreakable()) {
      throw new Error('Live session cannot be breaked from current state.');
    }

    await prismaClient.live_session.update({
      where: { id: this.id },
      data: { status: $Enums.live_session_status.BREAKED },
    });
  }

  async close() {
    if (!this.isCloseable()) {
      throw new Error('Live session cannot be closed from current state.');
    }
    await prismaClient.live_session.update({
      where: { id: this.id },
      data: { status: $Enums.live_session_status.CLOSED },
    });
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
