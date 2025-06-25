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

    // start connection immediately (non-blocking)
    this.client.connect()
      .then(() => {
        this.db = this.client.db(this.dbName);
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err.message);
      });
  }

  /**
   * @returns {boolean} true if the driver reports a working connection
   */
  isAlive() {
    return this.client && this.client.topology && this.client.topology.isConnected();
  }

  /**
   * @returns {Promise<number>} number of documents in 'users' collection
   */
  async nbUsers() {
    return this.db ? this.db.collection('users').countDocuments() : 0;
  }

  /**
   * @returns {Promise<number>} number of documents in 'files' collection
   */
  async nbFiles() {
    return this.db ? this.db.collection('files').countDocuments() : 0;
  }
}

const dbClient = new DBClient();
export default dbClient;

