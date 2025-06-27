// controllers/FilesController.js
import { promises as fs } from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

/* Folder on the host to store uploaded files */
const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  /* -------------------------------------------------- helpers */

  /** return Mongo-ID of user from X-Token or null */
  static async getUserFromToken(req) {
    const token = req.header('X-Token');
    if (!token) return null;
    const userId = await redisClient.get(`auth_${token}`);
    return userId;
  }

  /** small sanitizer to hide Mongo internals */
  static fileToResponse(file) {
    return {
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    };
  }

  /* ------------------------------------------------ POST /files */

  static async postUpload(req, res) {
    await dbClient.waitUntilConnected();

    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body || {};

    /* input validations */
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    /* parent checks */
    if (parentId !== 0) {
      const parent = await dbClient.filesCollection()
        .findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    /* build DB doc */
    const newDoc = {
      userId: ObjectId(ownerId),
      name,
      type,
      isPublic,
      parentId,
    };

    /* handle storage for file / image */
    if (type !== 'folder') {
      await fs.mkdir(TMP_FOLDER, { recursive: true });
      const localPath = path.join(TMP_FOLDER, uuidv4());
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      newDoc.localPath = localPath;
    }

    const { insertedId } = await dbClient.filesCollection().insertOne(newDoc);
    return res.status(201).json({ id: insertedId, ...newDoc });
  }

  /* ------------------------------------------------ GET /files/:id */

  static async getShow(req, res) {
    await dbClient.waitUntilConnected();

    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      file = await dbClient.filesCollection().findOne({
        _id: ObjectId(req.params.id),
        userId: ObjectId(ownerId),
      });
    } catch (err) {
      /* badly formatted id */
      return res.status(404).json({ error: 'Not found' });
    }
    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.json(FilesController.fileToResponse(file));
  }

  /* ------------------------------------------------ GET /files */

  static async getIndex(req, res) {
    await dbClient.waitUntilConnected();

    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = Number.parseInt(req.query.page, 10) || 0;

    const files = await dbClient.filesCollection()
      .aggregate([
        { $match: { userId: ObjectId(ownerId), parentId } },
        { $skip: page * 20 },
        { $limit: 20 },
      ])
      .toArray();

    return res.json(files.map(FilesController.fileToResponse));
  }

  /* ------------------------------------------------ PUT /files/:id/publish */

  static async putPublish(req, res) {
    await dbClient.waitUntilConnected();
    return FilesController.togglePublic(req, res, true);
  }

  /* ------------------------------------------------ PUT /files/:id/unpublish */

  static async putUnpublish(req, res) {
    await dbClient.waitUntilConnected();
    return FilesController.togglePublic(req, res, false);
  }

  /* helper for publish / unpublish */
  static async togglePublic(req, res, makePublic) {
    const ownerId = await FilesController.getUserFromToken(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      file = await dbClient.filesCollection().findOne({
        _id: ObjectId(req.params.id),
        userId: ObjectId(ownerId),
      });
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!file) return res.status(404).json({ error: 'Not found' });

    await dbClient.filesCollection().updateOne(
      { _id: file._id },
      { $set: { isPublic: makePublic } },
    );
    file.isPublic = makePublic;
    return res.json(FilesController.fileToResponse(file));
  }

  /* ------------------------------------------------ GET /files/:id/data */

  static async getFile(req, res) {
    await dbClient.waitUntilConnected();

    /* retrieve doc (no user filter first – public allowed) */
    let fileDoc;
    try {
      fileDoc = await dbClient.filesCollection()
        .findOne({ _id: ObjectId(req.params.id) });
    } catch (e) { /* bad id */ }
    if (!fileDoc) return res.status(404).json({ error: 'Not found' });

    /* check rights */
    if (!fileDoc.isPublic) {
      const ownerId = await FilesController.getUserFromToken(req);
      if (!ownerId || String(ownerId) !== String(fileDoc.userId)) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (fileDoc.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    /* which physical file? consider ?size=100/250/500 */
    const size = req.query.size;
    let candidatePath = fileDoc.localPath;
    if (size && ['100', '250', '500'].includes(size)) {
      candidatePath = `${fileDoc.localPath}_${size}`;
    }

    try {
      const data = await fs.readFile(candidatePath);
      const mimeType = mime.lookup(fileDoc.name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      return res.send(data);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;

