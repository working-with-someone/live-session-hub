import { Role } from '../enums/session';
import { Prisma } from '@prisma/client';

export type LiveSessionWithAll = Prisma.live_sessionGetPayload<{
  include: {
    organizer: true;
    allow: true;
    break_time: true;
    category: true;
    live_session_transition_log: true;
  };
}>;

export type LiveSessionField = keyof LiveSessionWithAll;

export interface liveSession {
  id: string;
  role: Role;
}
