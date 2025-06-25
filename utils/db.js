import { MongoClient } from 'mongodb';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 27017;
const DB_DATABASE = process.env.DB_DATABASE || 'files_manager';

class DBClient {
  constructor() {
    this.uri = `mongodb://${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;
    this.client = new MongoClient(this.uri, { useNewUrlParser: true, useUnifiedTopology: true });
    this.db = null;
  }

  async isAlive() {
    try {
      await this.client.connect();
      this.db = this.client.db(DB_DATABASE);
      return true;
    } catch (error) {
      console.error('Error connecting to MongoDB:', error);
      return false;
    }
  }

  async nbUsers() {
    if (this.db) {
      try {
        const collection = this.db.collection('users');
        const count = await collection.countDocuments();
        return count;
      } catch (error) {
        console.error('Error fetching user count:', error);
        return 0;
      }
    }
    return 0;
  }

  async nbFiles() {
    if (this.db) {
      try {
        const collection = this.db.collection('files');
        const count = await collection.countDocuments();
        return count;
      } catch (error) {
        console.error('Error fetching file count:', error);
        return 0;
      }
    }
    return 0;
  }

  async closeConnection() {
    await this.client.close();
  }
}

const dbClient = new DBClient();
export default dbClient;

