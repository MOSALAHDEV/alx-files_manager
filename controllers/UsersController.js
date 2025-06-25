// controllers/UsersController.js
import sha1 from 'sha1';
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
    const userExists = await dbClient
      .db.collection('users')
      .findOne({ email });

    if (userExists) return res.status(400).json({ error: 'Already exist' });

    // Insert the new user
    const insertionInfo = await dbClient
      .db.collection('users')
      .insertOne({
        email,
        password: sha1(password),
      });

    const newUser = {
      id: insertionInfo.insertedId,
      email,
    };
    return res.status(201).json(newUser);
  }
}

export default UsersController;
