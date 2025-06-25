// utils/db.js
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.dbName = database;

    // Start connection immediately (non-blocking)
    this.client.connect()
      .then(() => {
        this.db = this.client.db(this.dbName);
      })
      .catch((err) => console.error('MongoDB connection error:', err.message));
  }

  /**
   * @returns {boolean} true if the driver is connected
   */
  isAlive() {
    return this.client.topology && this.client.topology.isConnected();
  }

  /**
   * @returns {Promise<number>} number of docs in 'users' collection
   */
  async nbUsers() {
    if (!this.db) return 0;
    return this.db.collection('users').countDocuments();
  }

  /**
   * @returns {Promise<number>} number of docs in 'files' collection
   */
  async nbFiles() {
    if (!this.db) return 0;
    return this.db.collection('files').countDocuments();
  }
}

// Export a singleton
const dbClient = new DBClient();
export default dbClient;

