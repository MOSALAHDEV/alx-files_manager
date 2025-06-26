// controllers/UsersController.js
import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class UsersController {
  /**
   * POST /users
   * Create a new user with email & password.
   */
  static async postNew(req, res) {
    const { email, password } = req.body || {};

    // Basic validations
    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });

    // Check if the user already exists
    const userExists = await dbClient.db.collection('users').findOne({ email });
    if (userExists) return res.status(400).json({ error: 'Already exist' });

    // Insert the new user
    const { insertedId } = await dbClient.db.collection('users').insertOne({
      email,
      password: sha1(password),
    });

    return res.status(201).json({ id: insertedId.toString(), email });
  }

  /**
   * GET /users/me
   * Return user information based on the X-Token header.
   */
  static async getMe(req, res) {
    const token = req.header('X-Token');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: ObjectId(userId) });

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(200).json({ id: user._id.toString(), email: user.email });
  }
}

export default UsersController;
