import { OrganizerLiveSession } from './live-session';
import { liveSessionBreakScheduler } from './schedular/open-break-schedular';

class LiveSessionPool extends Map<string, OrganizerLiveSession> {
  constructor() {
    super();
  }

  add(liveSession: OrganizerLiveSession) {
    if (this.has(liveSession.id)) {
      return;
    }

    this.set(liveSession.id, liveSession);

    if (liveSession.break_time) {
      liveSessionBreakScheduler.add(liveSession.id);
    }
  }

  remove(liveSessionId: string) {
    if (!this.has(liveSessionId)) {
      return;
    }

    this.delete(liveSessionId);
  }
}

const liveSessionPool = new LiveSessionPool();

export default liveSessionPool;
