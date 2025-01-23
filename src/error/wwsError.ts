import httpStatusCode from 'http-status-codes';

/**
 *
 * @param status - HTTP status code.
 * @param message - Error message to respond to the client. If not provided, the status text corresponding to the status code will be used as the default response.
 * @param err - If the original Error is included, it will be treated as an unhandled exception in the error handler, and a 500 status code will be returned.
 */
class wwsError extends Error {
  status: number;
  statusText: string;
  originError: Error;
  constructor(status: number, message?: string, err?: any) {
    super(message);
    this.status = status;
    this.statusText = httpStatusCode.getStatusText(status);

    this.message = message ? message : httpStatusCode.getStatusText(status);
    this.originError = err;
  }
}

export { wwsError };
