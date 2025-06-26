// utils/db.js
import { MongoClient } from 'mongodb';

/**
 * Handles all interactions with MongoDB.
 */
class DBClient {
  constructor() {
    // Gather connection parameters from env (or use defaults)
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const dbName = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}`;

    // Initialise client and immediately start connection (non-blocking)
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.db = null;

    this.client.connect()
      .then(() => {
        this.db = this.client.db(dbName);
      })
      .catch((err) => console.error('MongoDB connection error:', err.message));
  }

  isAlive() {
    return !!(this.client
      && this.client.topology
      && this.client.topology.isConnected());
  }

  usersCollection() {
    return this.db ? this.db.collection('users') : null;
  }

  filesCollection() {
    return this.db ? this.db.collection('files') : null;
  }

  async nbUsers() {
    const col = this.usersCollection();
    return col ? col.countDocuments() : 0;
  }

  async nbFiles() {
    const col = this.filesCollection();
    return col ? col.countDocuments() : 0;
  }
}

const dbClient = new DBClient();
export default dbClient;
