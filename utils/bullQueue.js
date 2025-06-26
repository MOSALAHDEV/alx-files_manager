// utils/bullQueue.js
import Queue from 'bull';

/*
 * Central Bull queue for every “file-processing” job
 * (image-thumbnail generation, future clean-up jobs, …).
 * Keeping it in one place avoids creating multiple Redis
 * connections all over the codebase.
 */
const fileQueue = new Queue('fileQueue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
});

export default fileQueue;

