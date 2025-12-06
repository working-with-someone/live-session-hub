export interface SocketResponse {
  status: number;
  message?: string;
}

export type ResponseCb = (res: SocketResponse) => void;
