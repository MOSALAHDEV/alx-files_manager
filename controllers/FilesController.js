// controllers/FilesController.js
import { ObjectId } from 'mongodb';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';

/* Helpers */
const sanitize = (doc) => ({
  id: doc._id,
  userId: doc.userId,
  name: doc.name,
  type: doc.type,
  isPublic: doc.isPublic,
  parentId: doc.parentId,
});

const objectIdSafe = (id) => {
  try {
    return new ObjectId(id);
  } catch (_e) {
    return null;
  }
};

class FilesController {
  /* ------------------------------------------------ POST /files */
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, data, parentId = 0, isPublic = false,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    /* Validate parentId */
    if (parentId !== 0) {
      const parent = await dbClient.filesCollection.findOne({ _id: objectIdSafe(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileDoc = {
      userId: objectIdSafe(userId),
      name,
      type,
      isPublic,
      parentId,
    };

    /* Save to disk if needed */
    if (type !== 'folder') {
      await fs.mkdir(TMP_FOLDER, { recursive: true });
      const localPath = path.join(TMP_FOLDER, uuidv4());
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      fileDoc.localPath = localPath;
    }

    const { insertedId } = await dbClient.filesCollection.insertOne(fileDoc);
    fileDoc._id = insertedId; // for sanitize

    return res.status(201).json(sanitize(fileDoc));
  }

  /* ------------------------------------------------ GET /files/:id */
  static async getShow(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = await dbClient.filesCollection.findOne({
      _id: objectIdSafe(req.params.id),
      userId: objectIdSafe(userId),
    });

    if (!file) return res.status(404).json({ error: 'Not found' });
    return res.json(sanitize(file));
  }

  /* ------------------------------------------------ GET /files */
  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = Number.parseInt(req.query.page, 10) || 0;

    const files = await dbClient.filesCollection.aggregate([
      { $match: { userId: objectIdSafe(userId), parentId } },
      { $skip: page * 20 },
      { $limit: 20 },
    ]).toArray();

    return res.json(files.map(sanitize));
  }

  /* ------------------------------------------------ PUT /files/:id/publish */
  static async putPublish(req, res) {
    return FilesController.togglePublic(req, res, true);
  }

  /* ------------------------------------------------ PUT /files/:id/unpublish */
  static async putUnpublish(req, res) {
    return FilesController.togglePublic(req, res, false);
  }

  static async togglePublic(req, res, flag) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { value: file } = await dbClient.filesCollection.findOneAndUpdate(
      { _id: objectIdSafe(req.params.id), userId: objectIdSafe(userId) },
      { $set: { isPublic: flag } },
      { returnOriginal: false },
    );

    if (!file) return res.status(404).json({ error: 'Not found' });
    return res.json(sanitize(file));
  }

  /* ------------------------------------------------ GET /files/:id/data */
  static async getFile(req, res) {
    const { size } = req.query; // 500 | 250 | 100 | undefined
    const fileId = objectIdSafe(req.params.id);

    const fileDoc = await dbClient.filesCollection.findOne({ _id: fileId });
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });

    if (!fileDoc.isPublic) {
      const token = req.header('X-Token');
      const userId = await redisClient.get(`auth_${token}`);
      if (!userId || userId !== String(fileDoc.userId)) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (fileDoc.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    /* Resolve path (with thumbnail if requested) */
    let filePath = fileDoc.localPath;
    if (size) filePath = `${filePath}_${size}`;

    try {
      const data = await fs.readFile(filePath);
      res.setHeader('Content-Type', mime.lookup(fileDoc.name) || 'text/plain');
      return res.send(data);
    } catch (_e) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;

