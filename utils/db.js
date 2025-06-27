// utils/db.js
import { MongoClient } from 'mongodb';

/**
 * Lightweight Mongo DB helper (singleton)
 *  – handles the first connection asynchronously
 *  – exposes helpers to check liveness and grab collections
 */
class DBClient {
  constructor() {
    // Connection settings (env → fallback to defaults)
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    // Mongo URI & driver
    const uri = `mongodb://${host}:${port}`;
    this.client = new MongoClient(uri, { useUnifiedTopology: true });

    // internal flags
    this.db = null;          // populated once connected
    this.connected = false;  // quick boolean check
    // Promise that resolves once the first connection succeeds
    this.ready = this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
        this.connected = true;
      })
      .catch((err) => console.error('MongoDB connection error:', err.message));
  }

  /** @returns {boolean} true once the driver is connected  */
  isAlive() {
    return this.connected;
  }

  /** await until the initial connection is done */
  async waitUntilConnected() {
    await this.ready;
  }

  /** users collection helper (null while connecting) */
  usersCollection() {
    return this.connected ? this.db.collection('users') : null;
  }

  /** files collection helper (null while connecting) */
  filesCollection() {
    return this.connected ? this.db.collection('files') : null;
  }

  /** nb of users */
  async nbUsers() {
    if (!this.connected) return 0;
    return this.usersCollection().countDocuments();
  }

  /** nb of files */
  async nbFiles() {
    if (!this.connected) return 0;
    return this.filesCollection().countDocuments();
  }
}

/* export singleton */
const dbClient = new DBClient();
export default dbClient;

