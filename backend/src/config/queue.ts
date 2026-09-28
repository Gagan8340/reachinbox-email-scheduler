import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const OUTBOUND_EMAIL_QUEUE = 'reachinbox-outbound-queue';

export const emailQueue = new Queue(OUTBOUND_EMAIL_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});