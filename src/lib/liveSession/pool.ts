import { OrganizerLiveSession } from './live-session';

// organizer의 connection이 생성된 live session들이 유지되는 pool
class LiveSessionPool extends Map<string, OrganizerLiveSession> {
  constructor() {
    super();
  }

  // live session을 추가한다.
  async add(liveSession: OrganizerLiveSession) {
    if (this.has(liveSession.id)) {
      return;
    }

    this.set(liveSession.id, liveSession);
  }

  // live session을 제거한다.
  remove(liveSessionId: string) {
    if (!this.has(liveSessionId)) {
      return;
    }

    this.delete(liveSessionId);
  }
}

const liveSessionPool = new LiveSessionPool();

export default liveSessionPool;
