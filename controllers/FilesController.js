import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(req, res) {
    const { name, type, parentId = 0, isPublic = false, data } = req.body;
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type) return res.status(400).json({ error: 'Missing type' });
    if (!['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== 0) {
      const parentFile = await dbClient.db.collection('files').findOne({ _id: parentId });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const file = {
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    if (type !== 'folder') {
      const fileUuid = uuidv4();
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const filePath = path.join(folderPath, fileUuid);

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const fileData = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, fileData);

      file.localPath = filePath;
    }

    const result = await dbClient.db.collection('files').insertOne(file);

    const newFile = {
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
    };
    return res.status(201).json(newFile);
  }
}

export default FilesController;

