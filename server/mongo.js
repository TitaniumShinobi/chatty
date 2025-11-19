// /server/mongo.js
import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = "mongodb+srv://dwoodson92_db_user:7Ez8fnZaWsrqQCo1@chatty.obnxwcm.mongodb.net/?retryWrites=true&w=majority&appName=Chatty";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

export default client;