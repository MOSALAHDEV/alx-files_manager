// utils/db.js
import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    // Get connection params from env or use defaults
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.db = null;

    // Start the (non-blocking) connection as soon as the instance is created
    this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
      })
      .catch((err) => console.error('MongoDB connection error:', err.message));
  }

  /**
   * @returns {boolean} true when the driver reports a live connection
   */
  isAlive() {
    return this.client.topology && this.client.topology.isConnected();
  }

  /**
   * @returns {Promise<number>} number of documents in the 'users' collection
   */
  async nbUsers() {
    if (!this.db) return 0;
    return this.db.collection('users').countDocuments();
  }

  /**
   * @returns {Promise<number>} number of documents in the 'files' collection
   */
  async nbFiles() {
    if (!this.db) return 0;
    return this.db.collection('files').countDocuments();
  }
}

// Export a singleton
const dbClient = new DBClient();
export default dbClient;

