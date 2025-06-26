// middlewares/authenticate.js
/**
 * Lightweight helper used by several controllers.
 * It simply converts the X-Token header into the current Mongo user document
 * (or returns null when the token is missing / invalid).
 */
import redisClient from '../utils/redis';
import dbClient    from '../utils/db';

export const getUserFromXToken = async (token = '') => {
  if (!token) return null;

  const userId = await redisClient.get(`auth_${token}`);
  if (!userId) return null;

  return dbClient.usersCollection().findOne({ _id: dbClient.toObjectId(userId) });
};

