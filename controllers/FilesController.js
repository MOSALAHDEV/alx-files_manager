// controllers/FilesController.js
import { ObjectId } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';
import mime from 'mime-types';
import { v4 as uuid } from 'uuid';
import Queue from 'bull';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';
// create a Bull queue for image processing
const fileQueue = new Queue('fileQueue');

class FilesController {
  /* POST /files */
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // verify parent
    if (parentId !== 0) {
      const parentFile = await dbClient.db
        .collection('files')
        .findOne({ _id: ObjectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // build doc
    const fileDoc = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId,
    };

    // for file/image, write to disk
    if (type !== 'folder') {
      await fs.mkdir(TMP_FOLDER, { recursive: true });
      const localPath = path.join(TMP_FOLDER, uuid());
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      fileDoc.localPath = localPath;
    }

    // insert in DB
    const { insertedId } = await dbClient.db
      .collection('files')
      .insertOne(fileDoc);

    // if image, queue thumbnail jobs
    if (type === 'image') {
      fileQueue.add({ userId, fileId: insertedId.toString() });
    }

    return res.status(201).json({
      id: insertedId,
      userId: fileDoc.userId,
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic: fileDoc.isPublic,
      parentId: fileDoc.parentId,
    });
  }

  /* GET /files/:id/data?size=… */
  static async getFile(req, res) {
    const { id } = req.params;
    const size = req.query.size ? Number(req.query.size) : null;
    const token = req.header('X-Token');
    const authUser = token ? await redisClient.get(`auth_${token}`) : null;

    // fetch file document
    let file;
    try {
      file = await dbClient.db
        .collection('files')
        .findOne({ _id: ObjectId(id) });
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!file) return res.status(404).json({ error: 'Not found' });

    // permission: if not public and no auth or wrong user
    if (!file.isPublic) {
      if (!authUser || authUser !== file.userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // pick correct path
    const basePath = file.localPath;
    const realPath = [100, 250, 500].includes(size)
      ? `${basePath}_${size}`
      : basePath;

    // ensure file exists
    try {
      await fs.access(realPath);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }

    // serve file
    const mimeType = mime.lookup(file.name) || 'application/octet-stream';
    const data = await fs.readFile(realPath);
    res.set('Content-Type', mimeType);
    return res.send(data);
  }

  // … other methods (getShow, getIndex, putPublish, putUnpublish) remain unchanged …
}

export default FilesController;
