const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Try to get the MongoDB URI from server.js or config
let uri = '';
try {
  const serverPath = path.join(__dirname, 'server.js');
  if (fs.existsSync(serverPath)) {
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    const match = serverContent.match(/mongoose\.connect\(['"](.+?)['"]/);
    if (match && match[1]) {
      uri = match[1];
      console.log('Found MongoDB URI in server.js');
    }
  }
} catch (err) {
  console.error('Error reading server.js:', err);
}

// Fallback options if we couldn't extract the URI
if (!uri) {
  console.log('Using fallback MongoDB URI');
  uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tution_db';
}

console.log(`Connecting to MongoDB at: ${uri.replace(/mongodb:\/\/(.+?)@/, 'mongodb://***@')}`);

mongoose.connect(uri, {})
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      // Direct access to the collection
      const collection = mongoose.connection.collection('parents');
      
      // Get all indexes
      const indexes = await collection.indexes();
      console.log('Current indexes on parents collection:', JSON.stringify(indexes, null, 2));
      
      // Find and drop the email index
      for (const index of indexes) {
        if (index.key && index.key.email !== undefined) {
          console.log(`Found email index: ${index.name}`);
          await collection.dropIndex(index.name);
          console.log(`Successfully dropped index: ${index.name}`);
        }
      }
      
      // Verify the indexes after dropping
      const remainingIndexes = await collection.indexes();
      console.log('Remaining indexes:', JSON.stringify(remainingIndexes, null, 2));
      
      // Now create a new document without email to test
      console.log('Testing with a new document...');
      const result = await collection.insertOne({
        testField: 'This is a test document without email',
        createdAt: new Date()
      });
      console.log('Test document created:', result.insertedId);
      
      // Clean up the test document
      await collection.deleteOne({ _id: result.insertedId });
      console.log('Test document deleted');
      
      console.log('Index fix completed successfully!');
    } catch (error) {
      console.error('Error fixing database:', error);
    } finally {
      mongoose.connection.close();
      console.log('MongoDB connection closed');
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  }); 