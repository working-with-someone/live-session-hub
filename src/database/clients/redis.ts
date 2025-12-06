import { createClient } from 'redis';
import redisClientConfig from '../../config/redisClient.config';

const redisClient = createClient(redisClientConfig);

redisClient.on('ready', () => {
  /* eslint-disable-next-line no-console */
  console.log(
    `✅  Redis client connected on port ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
  );
});

redisClient.on('end', () => {
  /* eslint-disable-next-line no-console */
  console.log(`✅  Redis client disconnected`);
});

export default redisClient;
