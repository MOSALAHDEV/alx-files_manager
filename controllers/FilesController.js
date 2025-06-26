import { promises as fs } from 'fs';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import fileQueue from '../utils/bullQueue';
import { getUserFromToken } from '../middlewares/authenticate';

const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';
const PAGE_SIZE = 20;

function makePublicResponse(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    name: doc.name,
    type: doc.type,
    isPublic: doc.isPublic,
    parentId: doc.parentId,
  };
}

export default class FilesController {
  /* ---------------------------------------------------------------- */
  /* task 5 POST /files – already implemented earlier                  */
  /* ---------------------------------------------------------------- */

  /* --------------------------- task 6 ----------------------------- */
  static async getShow(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      file = await dbClient
        .filesCollection()
        .findOne({ _id: ObjectId(req.params.id), userId: user._id });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) return res.status(404).json({ error: 'Not found' });
    return res.json(makePublicResponse(file));
  }

  static async getIndex(req, res) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = Number.parseInt(req.query.page || '0', 10);

    const match = { userId: user._id };
    if (parentId !== 0) match.parentId = parentId;

    const docs = await dbClient
      .filesCollection()
      .aggregate([
        { $match: match },
        { $skip: page * PAGE_SIZE },
        { $limit: PAGE_SIZE },
      ])
      .toArray();

    return res.json(docs.map(makePublicResponse));
  }

  /* --------------------------- task 7 ----------------------------- */
  static async publishToggle(req, res, makePublic) {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const filter = { _id: ObjectId(req.params.id), userId: user._id };
    const file = await dbClient.filesCollection().findOne(filter);
    if (!file) return res.status(404).json({ error: 'Not found' });

    await dbClient.filesCollection().updateOne(filter, {
      $set: { isPublic: makePublic },
    });

    file.isPublic = makePublic;
    return res.json(makePublicResponse(file));
  }

  static putPublish(req, res) {
    return FilesController.publishToggle(req, res, true);
  }

  static putUnpublish(req, res) {
    return FilesController.publishToggle(req, res, false);
  }

  /* --------------------------- task 8 ----------------------------- */
  static async getFile(req, res) {
    const { id } = req.params;
    const size = req.query.size;

    const fileDoc = await dbClient
      .filesCollection()
      .findOne({ _id: ObjectId(id) });
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });

    const user = await getUserFromToken(req);
    const owner = user && user._id.toString() === fileDoc.userId.toString();
    if (!fileDoc.isPublic && !owner) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (fileDoc.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    const pathSuffix = size ? `_${size}` : '';
    const localPath = `${fileDoc.localPath}${pathSuffix}`;

    try {
      const data = await fs.readFile(localPath);
      res.setHeader('Content-Type', mime.contentType(fileDoc.name) || 'text/plain');
      return res.end(data);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }

  /* ------------- helper used in POST /files (thumbnail job) ------------- */
  static async queueThumbnailJob(userId, fileId) {
    await fileQueue.add({ userId, fileId });
  }

  /* ------------- helper used in POST /files (binary storage) ------------ */
  static async saveToDisk(dataB64) {
    await fs.mkdir(TMP_FOLDER, { recursive: true });
    const p = path.join(TMP_FOLDER, uuidv4());
    await fs.writeFile(p, Buffer.from(dataB64, 'base64'));
    return p;
  }
}

