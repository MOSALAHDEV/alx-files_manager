// utils/db.js
import { MongoClient, ObjectId } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const dbName = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });

    this.client.connect()
      .then(() => { this.db = this.client.db(dbName); })
      .catch((err) => console.error('MongoDB error:', err.message));
  }

  /* ---------- generic helpers ---------- */

  isAlive() {
    return this.client && this.client.topology && this.client.topology.isConnected();
  }

  usersCollection() { return this.db.collection('users'); }
  filesCollection() { return this.db.collection('files'); }

  async nbUsers() { return this.usersCollection().countDocuments(); }
  async nbFiles() { return this.filesCollection().countDocuments(); }

  toObjectId(id) {
    try { return new ObjectId(id); } catch (e) { return null; }
  }

  /* ---------- helpers for File controller ---------- */

  async getFileById(id) {
    const _id = this.toObjectId(id);
    if (!_id) return null;
    return this.filesCollection().findOne({ _id });
  }

  async getFileByIdAndUserId(id, userId) {
    const _id = this.toObjectId(id);
    if (!_id) return null;
    return this.filesCollection().findOne({ _id, userId });
  }
}

const dbClient = new DBClient();
export default dbClient;

