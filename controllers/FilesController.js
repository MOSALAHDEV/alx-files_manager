// controllers/FilesController.js
import { ObjectId } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

/* constants */
const TMP_DIR = process.env.FOLDER_PATH || '/tmp/files_manager';
const PAGE_SIZE = 20;
const VALID_TYPES = ['folder', 'file', 'image'];

class FilesController {
  /** helper – returns mongo user document from X-Token or null */
  static async getUser(req) {
    const token = req.header('X-Token');
    if (!token) return null;
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return null;
    return dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
  }

  /** POST /files */
  static async postUpload(req, res) {
    const user = await this.getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, data,
      parentId = 0,
      isPublic = false,
    } = req.body || {};

    /* basic validation */
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Missing type' });
    if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

    /* parent checks */
    if (parentId !== 0) {
      const parent = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const doc = {
      userId: user._id,
      name,
      type,
      isPublic,
      parentId,
    };

    /* save file/image on disk */
    if (type !== 'folder') {
      await fs.mkdir(TMP_DIR, { recursive: true });
      const localPath = path.join(TMP_DIR, uuidv4());
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      doc.localPath = localPath;
    }

    const { insertedId } = await dbClient.db.collection('files').insertOne(doc);
    return res.status(201).json({
      id: insertedId,
      ...doc,
    });
  }

  /** GET /files/:id */
  static async getShow(req, res) {
    const user = await this.getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      file = await dbClient.db.collection('files').findOne({
        _id: ObjectId(req.params.id),
        userId: user._id,
      });
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  /** GET /files */
  static async getIndex(req, res) {
    const user = await this.getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = Number.parseInt(req.query.page || '0', 10);

    const match = { userId: user._id };
    if (parentId !== 0) match.parentId = parentId;

    const files = await dbClient.db.collection('files')
      .aggregate([
        { $match: match },
        { $skip: page * PAGE_SIZE },
        { $limit: PAGE_SIZE },
      ]).toArray();

    return res.json(files.map((f) => ({
      id: f._id,
      userId: f.userId,
      name: f.name,
      type: f.type,
      isPublic: f.isPublic,
      parentId: f.parentId,
    })));
  }

  /** PUT /files/:id/publish */
  static async putPublish(req, res) {
    return this.togglePublic(req, res, true);
  }

  /** PUT /files/:id/unpublish */
  static async putUnpublish(req, res) {
    return this.togglePublic(req, res, false);
  }

  /* common helper for publish/unpublish */
  static async togglePublic(req, res, publish) {
    const user = await this.getUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { value: file } = await dbClient.db.collection('files')
      .findOneAndUpdate(
        { _id: ObjectId(req.params.id), userId: user._id },
        { $set: { isPublic: publish } },
        { returnOriginal: false },
      );

    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  /** GET /files/:id/data */
  static async getFile(req, res) {
    const { id } = req.params;
    const size = req.query.size; // 100 / 250 / 500 or undefined

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(id) });
    if (!file) return res.status(404).json({ error: 'Not found' });

    /* access control */
    const user = await this.getUser(req);
    const owner = user && user._id.toString() === file.userId.toString();
    if (!file.isPublic && !owner) return res.status(404).json({ error: 'Not found' });

    if (file.type === 'folder') return res.status(400).json({ error: "A folder doesn't have content" });

    const localPath = size ? `${file.localPath}_${size}` : file.localPath;
    try {
      await fs.access(localPath);
    } catch {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    const data = await fs.readFile(localPath);
    return res.end(data);
  }
}

export default FilesController;

