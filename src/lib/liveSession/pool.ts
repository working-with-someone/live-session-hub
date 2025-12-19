import { OrganizerLiveSession } from './live-session';
import { liveSessionBreakScheduler } from './schedular/open-break-schedular';

// activate상태(open, break) 인 live session의 pool
class LiveSessionPool extends Map<string, OrganizerLiveSession> {
  constructor() {
    super();
  }

  // activate의 live session을 추가한다.
  async add(liveSession: OrganizerLiveSession) {
    if (this.has(liveSession.id)) {
      return;
    }

    this.set(liveSession.id, liveSession);

    // activate상태인 live session가 break time 설정이 되어있다면, scheduling 되어야한다.
    if (liveSession.break_time) {
      liveSessionBreakScheduler.add(liveSession.id);
    }

    // live session이 activate된 시점에 started_at을 기록한다.
    await liveSession.start();
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
