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

export type LiveSessionSchedule = Prisma.live_sessionGetPayload<{
  select: {
    id: true;

    break_time: {
      select: {
        interval: true;
        duration: true;
      };
    };
  };
}> & {
  nextBreakTime?: Date;
  nextOpenTime?: Date;
  openCb: () => void;
  breakCb: () => void;
};

export interface liveSession {
  id: string;
  role: Role;
}
