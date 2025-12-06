import { OrganizerLiveSession } from './live-session';

class LiveSessionPool extends Map<string, OrganizerLiveSession> {
  constructor() {
    super();
  }

  add(liveSession: OrganizerLiveSession) {
    if (this.has(liveSession.id)) {
      return;
    }

    this.set(liveSession.id, liveSession);
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
