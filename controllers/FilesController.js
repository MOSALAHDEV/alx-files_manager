import { v4 as uuid } from 'uuid';
import { ObjectId } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';
import mime from 'mime-types'; // Mime types for file content type
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';

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
      return res.status(400).json({ error: 'Missing or invalid type' });
    }
    if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

    // Parent checks for folders
    let parentFile = null;
    if (parentId !== 0) {
      parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    // Build file document for MongoDB
    const fileDoc = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId,
    };

    // Handle file/image storage
    if (type !== 'folder') {
      const localPath = path.join(TMP_FOLDER, uuid());
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));
      fileDoc.localPath = localPath;
    }

    const result = await dbClient.db.collection('files').insertOne(fileDoc);
    return res.status(201).json({
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
      localPath: fileDoc.localPath || null,
    });
  }

  /* GET /files/:id */
  static async getShow(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      file = await dbClient.db.collection('files')
        .findOne({ _id: ObjectId(req.params.id), userId: ObjectId(userId) });
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

  /* GET /files?parentId=…&page=… */
  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = Number.parseInt(req.query.page, 10) || 0;

    const pipeline = [
      { $match: { userId: ObjectId(userId), parentId } },
      { $skip: page * 20 },
      { $limit: 20 },
    ];
    const files = await dbClient.db.collection('files').aggregate(pipeline).toArray();
    const sanitized = files.map((f) => ({
      id: f._id,
      userId: f.userId,
      name: f.name,
      type: f.type,
      isPublic: f.isPublic,
      parentId: f.parentId,
    }));
    return res.json(sanitized);
  }

  /* GET /files/:id/data */
  static async getFile(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(req.params.id), userId: ObjectId(userId) });
    if (!file) return res.status(404).json({ error: 'Not found' });

    // If the file is private and the user isn't authorized, return an error
    if (!file.isPublic) return res.status(404).json({ error: 'Not found' });

    // If the file is a folder, it cannot have content
    if (file.type === 'folder') return res.status(400).json({ error: "A folder doesn't have content" });

    // If the file is not locally available, return an error
    if (!file.localPath) return res.status(404).json({ error: 'Not found' });

    // Get the MIME type based on the file's extension
    const mimeType = mime.lookup(file.name);
    if (!mimeType) return res.status(500).json({ error: 'Unable to determine MIME type' });

    try {
      const fileContent = await fs.readFile(file.localPath);
      return res.type(mimeType).send(fileContent);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
