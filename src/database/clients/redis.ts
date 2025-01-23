import { createClient } from 'redis';
import redisClientConfig from '../../config/redisClient.config';

const redisClient = createClient(redisClientConfig);

redisClient.on('ready', () => {
  console.log(
    `✅  Redis client connected on port ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
  );
});

redisClient.on('end', () => {
  console.log(`✅  Redis client disconnected`);
});

export default redisClient;
