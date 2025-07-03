import type { SessionOptions, CookieOptions } from 'express-session';
import redisStoreConfig from '../config/redisStore.config';
import { RedisStore } from 'connect-redis';

const cookieConfig: CookieOptions = {
  secure: false,
  domain: process.env.DOMAIN,
  httpOnly: true,
};

export const sessionIdName = '_dev_sid';

if (process.env.NODE_ENV === 'production') {
  cookieConfig.secure = true;
}

const redisStore = new RedisStore(redisStoreConfig);

const sessionConfig: SessionOptions = {
  name: sessionIdName,
  secret: process.env.APP_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: cookieConfig,
  store: redisStore,
};

export default sessionConfig;
