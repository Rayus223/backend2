const mongoose = require('mongoose');

const fixIndexes = async () => {
  try {
    // Wait for MongoDB connection to be established
    if (mongoose.connection.readyState !== 1) {
      console.log('Waiting for MongoDB connection before fixing indexes...');
      await new Promise(resolve => {
        // Set up a one-time listener for the connected event
        mongoose.connection.once('connected', resolve);
        // If already connected, resolve immediately
        if (mongoose.connection.readyState === 1) {
          resolve();
        }
      });
    }
    
    console.log('MongoDB connected, checking and fixing indexes...');
    
    // Access the parents collection
    const collection = mongoose.connection.collection('parents');
    
    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes on parents collection:', indexes);
    
    // Find email index
    let emailIndexFound = false;
    for (const index of indexes) {
      if (index.key && index.key.email !== undefined) {
        emailIndexFound = true;
        console.log(`Found problematic email index: ${index.name}`);
        try {
          await collection.dropIndex(index.name);
          console.log(`Successfully dropped index: ${index.name}`);
        } catch (dropError) {
          console.error(`Error dropping index ${index.name}:`, dropError);
        }
      }
    }
    
    if (!emailIndexFound) {
      console.log('No email index found, database is already fixed');
    } else {
      // Verify fix was successful
      const remainingIndexes = await collection.indexes();
      console.log('Indexes after fixing:', remainingIndexes);
      
      // Try inserting a test document to confirm fix
      try {
        const testInsert = await collection.insertOne({
          _test_document: true,
          created: new Date()
        });
        console.log('Test document insert successful, index issue fixed!');
        
        // Clean up the test document
        await collection.deleteOne({ _id: testInsert.insertedId });
      } catch (testError) {
        console.error('Test document insert failed, issue may still exist:', testError);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error fixing database indexes:', error);
    return { success: false, error };
  }
};

module.exports = fixIndexes; 