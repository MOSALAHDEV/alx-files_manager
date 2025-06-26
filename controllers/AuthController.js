// controllers/AuthController.js
import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  /**
   * GET /connect
   * Basic-Auth header ➜ generate token ➜ save in Redis 24 h.
   */
  static async getConnect(req, res) {
    try {
      const authHeader = req.header('Authorization') || '';
      if (!authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Decode “Basic <base64(email:password)>”
      const credential = Buffer.from(authHeader.split(' ')[1], 'base64')
        .toString('utf-8');
      const [email, password] = credential.split(':');

      // Look for user with matching email & SHA-1(password)
      const user = await dbClient.db
        .collection('users')
        .findOne({ email, password: sha1(password) });

      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const token = uuidv4();
      await redisClient.set(`auth_${token}`, user._id.toString(), 60 * 60 * 24); // 24 h

      return res.status(200).json({ token });
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error('Auth error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  /**
   * GET /disconnect
   * Invalidate the token found in X-Token header.
   */
  static async getDisconnect(req, res) {
    const token = req.header('X-Token');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await redisClient.del(`auth_${token}`);
    return res.status(204).send();
  }
}

export default AuthController;
