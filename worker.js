// worker.js
import Queue from 'bull';
import imageThumbnail from 'image-thumbnail';
import fs from 'fs';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');

  // make sure the file belongs to that user
  const file = await dbClient.filesCollection().findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });
  if (!file) throw new Error('File not found');

  const { localPath } = file;
  // generate three thumbnails in parallel
  const sizes = [500, 250, 100];
  await Promise.all(
    sizes.map(async (size) => {
      const thumb = await imageThumbnail(localPath, { width: size });
      await fs.promises.writeFile(`${localPath}_${size}`, thumb);
    }),
  );

  console.log(`Thumbnail job ${job.id} completed`);
});

fileQueue.on('failed', (job, err) => {
  console.error(`Thumbnail job ${job.id} failed: ${err.message}`);
});

export default fileQueue;
