require('dotenv').config();
const { PineconeClient } = require('@pinecone-database/pinecone');

const pinecone = new PineconeClient();

async function initPinecone() {
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });
  console.log('Pinecone initialized');
}

module.exports = { pinecone, initPinecone };
