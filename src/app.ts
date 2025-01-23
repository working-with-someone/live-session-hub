import express from 'express';
import session from 'express-session';
import sessionConfig from './config/session.config';
import httpAuthMiddleware from './middleware/http/auth';
import helmet from 'helmet';
import cors from 'cors';

const app = express();

app.use(session(sessionConfig));
app.use(httpAuthMiddleware);

app.use(helmet({}));

app.use(
  cors({
    origin: process.env.WWS_CLIENT_APP_ORIGIN,
    credentials: true,
  })
);

export default app;
