import redisClient from '../utils/redis';
import dbClient from '../utils/db';

/**
 * Resolve a user document from the X-Token header.
 * Returns the user document or null.
 */
export async function getUserFromToken(req) {
  const token = req.header('X-Token');
  if (!token) return null;

  const id = await redisClient.get(`auth_${token}`);
  if (!id) return null;

  return dbClient.usersCollection().findOne({ _id: dbClient.toObjectId(id) });
}

