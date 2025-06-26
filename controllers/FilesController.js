// controllers/FilesController.js
import { ObjectId } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';

const cleanDoc = (doc) => ({
  id: doc._id.toString(),
  userId: doc.userId.toString(),
  name: doc.name,
  type: doc.type,
  isPublic: doc.isPublic,
  parentId: doc.parentId,
});

class FilesController {
  static async getUserFromToken(req) {
    const token = req.header('X-Token');
    if (!token) return null;
    const userId = await redisClient.get(`auth_${token}`);
    return userId;
  }

  static async postUpload(req, res) {
    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

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

    if (parentId !== 0) {
      const parent = await dbClient.filesCollection().findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileDoc = {
      userId: ObjectId(ownerId),
      name,
      type,
      isPublic,
      parentId,
    };

    if (type !== 'folder') {
      await fs.mkdir(TMP_FOLDER, { recursive: true });
      const localPath = path.join(TMP_FOLDER, uuidv4());
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      fileDoc.localPath = localPath;
    }

    const { insertedId } = await dbClient.filesCollection().insertOne(fileDoc);
    return res.status(201).json({ id: insertedId.toString(), ...fileDoc });
  }

  static async getShow(req, res) {
    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      file = await dbClient.filesCollection()
        .findOne({ _id: ObjectId(req.params.id), userId: ObjectId(ownerId) });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(cleanDoc(file));
  }

  static async getIndex(req, res) {
    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = Number.parseInt(req.query.page || '0', 10);
    const matchStage = { userId: ObjectId(ownerId), parentId };
    const files = await dbClient.filesCollection()
      .aggregate([
        { $match: matchStage },
        { $skip: page * 20 },
        { $limit: 20 },
      ])
      .toArray();

    return res.status(200).json(files.map(cleanDoc));
  }
}

export default FilesController;
