import { ObjectId } from 'mongodb';
import { promises as fs } from 'fs';
import { v4 as uuid } from 'uuid';
import path from 'path';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const TMP_FOLDER = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  /**
   * POST /files
   * Uploads a file to the system, stores it in MongoDB and the local file system
   */
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    // Validate input fields
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing or invalid type' });
    }
    if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

    // Parent file checks (only for files or images)
    let parentFile = null;
    if (parentId !== 0) {
      parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    // Build the file document for MongoDB
    const fileDoc = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId,
    };

    // Handle file or image storage
    if (type !== 'folder') {
      // Create the tmp folder if not exists
      await fs.mkdir(TMP_FOLDER, { recursive: true });

      // Generate a unique file name for storage
      const localPath = path.join(TMP_FOLDER, uuid());

      // Write the Base64 data to file
      await fs.writeFile(localPath, Buffer.from(data, 'base64'));

      // Save the file's local path in the database document
      fileDoc.localPath = localPath;
    }

    // Insert the new file document into MongoDB
    const result = await dbClient.db.collection('files').insertOne(fileDoc);

    // Return the newly created file's information
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

  /**
   * GET /files/:id
   * Retrieves a file by ID for the authenticated user
   */
  static async getShow(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let file;
    try {
      // Retrieve the file from MongoDB
      file = await dbClient.db.collection('files')
        .findOne({ _id: ObjectId(req.params.id), userId: ObjectId(userId) });
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }

    // If file not found
    if (!file) return res.status(404).json({ error: 'Not found' });

    // Return the file details
    return res.json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
      localPath: file.localPath,
    });
  }

  /**
   * GET /files
   * Lists all files for a user with pagination and filtering by parentId
   */
  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0; // Default to root (parentId = 0)
    const page = Number.parseInt(req.query.page, 10) || 0;

    // MongoDB aggregation to get files with pagination
    const pipeline = [
      { $match: { userId: ObjectId(userId), parentId } },
      { $skip: page * 20 }, // Skip to the correct page
      { $limit: 20 }, // Limit the number of items per page
    ];

    // Fetch the files from the database
    const files = await dbClient.db.collection('files').aggregate(pipeline).toArray();

    // Sanitize the results before sending
    const sanitized = files.map((f) => ({
      id: f._id,
      userId: f.userId,
      name: f.name,
      type: f.type,
      isPublic: f.isPublic,
      parentId: f.parentId,
      localPath: f.localPath,
    }));

    return res.json(sanitized); // Return the sanitized file list
  }
}

export default FilesController;
