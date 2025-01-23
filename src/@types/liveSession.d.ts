export type liveSessionRole = 'organizer' | 'participant';

export interface liveSession {
  id: string;
  role: liveSessionRole;
}
