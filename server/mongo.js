import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGODB_URI || '';

if (!uri) {
  console.error('❌ [MongoDB] MONGODB_URI is not set. MongoDB client will not connect.');
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

export default client;