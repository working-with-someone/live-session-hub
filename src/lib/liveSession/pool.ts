import { OrganizerLiveSession } from './live-session';

class LiveSessionPool extends Map<String, OrganizerLiveSession> {
  constructor() {
    super();
  }

  add(liveSession: OrganizerLiveSession) {
    if (this.has(liveSession.id)) {
      console.warn(`live session ${liveSession.id} already exist`);
      return;
    }

    this.set(liveSession.id, liveSession);
  }

  remove(liveSessionId: string) {
    if (!this.has(liveSessionId)) {
      console.warn(`live session ${liveSessionId} does not exist`);
      return;
    }

    this.delete(liveSessionId);
  }
}

const liveSessionPool = new LiveSessionPool();

export default liveSessionPool;
