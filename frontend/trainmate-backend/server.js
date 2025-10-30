// import express from 'express';
// import dotenv from 'dotenv';
// import { Pinecone } from '@pinecone-database/pinecone';

// dotenv.config();

// const app = express();
// app.use(express.json());
// const PORT = process.env.PORT || 5000;

// (async () => {
//   try {
//     const pinecone = new Pinecone({
//       apiKey: process.env.PINECONE_API_KEY,
//     });

//     console.log('✅ Pinecone initialized');

//     const INDEX_NAME = 'example-index';
//     const DIMENSION = 1536;

//     const { indexes } = await pinecone.listIndexes();

//     if (!indexes.includes(INDEX_NAME)) {
//       console.log('🆕 Creating new Pinecone index...');

//       await pinecone.createIndex({
//         name: INDEX_NAME,
//         dimension: DIMENSION,
//         metric: 'cosine',
//         spec: {
//           serverless: {
//             cloud: 'aws',          // choose your provider
//             region: 'us-east-1',   // choose your region
//           },
//         },
//       });

//       console.log(`✅ Index '${INDEX_NAME}' created`);
//     } else {
//       console.log(`✅ Index '${INDEX_NAME}' already exists`);
//     }

//     const index = pinecone.index(INDEX_NAME);

//     // --- ROUTES ---
//     app.get('/check-pinecone', async (req, res) => {
//       try {
//         const { indexes } = await pinecone.listIndexes();
//         res.json({ success: true, indexes });
//       } catch (error) {
//         res.json({ success: false, error: error.message });
//       }
//     });

//     app.get('/test-vector', async (req, res) => {
//       try {
//         const testVector = Array(DIMENSION).fill(0.5);

//         await index.upsert([
//           {
//             id: 'test1',
//             values: testVector,
//           },
//         ]);

//         const result = await index.query({
//           topK: 1,
//           vector: testVector,
//         });

//         res.json({ message: '✅ Vector upserted & queried successfully!', result });
//       } catch (error) {
//         res.json({ error: error.message });
//       }
//     });

//     app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
//   } catch (err) {
//     console.error('❌ Error initializing Pinecone:', err);
//   }
// })();

import express from 'express';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config();

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    console.log('✅ Pinecone initialized');

    const INDEX_NAME = 'example-index';
    const DIMENSION = 1536;

    // List existing indexes
    const { indexes } = await pinecone.listIndexes();

    if (!indexes.includes(INDEX_NAME)) {
      console.log(`🆕 Creating index '${INDEX_NAME}' ...`);

      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: DIMENSION,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',          // you can use 'aws' or 'gcp'
            region: 'us-east-1',   // same as your project region
          },
        },
      });

      console.log(`✅ Index '${INDEX_NAME}' created`);
    } else {
      console.log(`✅ Index '${INDEX_NAME}' already exists`);
    }

    const index = pinecone.index(INDEX_NAME);

    // Test routes
    app.get('/check-pinecone', async (req, res) => {
      try {
        const { indexes } = await pinecone.listIndexes();
        res.json({ success: true, indexes });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    app.get('/test-vector', async (req, res) => {
      try {
        const testVector = Array(DIMENSION).fill(0.5);

        await index.upsert([
          { id: 'test1', values: testVector },
        ]);

        const result = await index.query({
          topK: 1,
          vector: testVector,
        });

        res.json({ message: '✅ Vector upserted and queried!', result });
      } catch (error) {
        res.json({ error: error.message });
      }
    });

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Error initializing Pinecone:', err);
  }
})();

