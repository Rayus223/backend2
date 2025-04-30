const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
    dropEmailIndex();
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

async function dropEmailIndex() {
    try {
        // Get the collection
        const collection = mongoose.connection.collection('parents');
        
        // Get all indexes
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes);
        
        // Find and drop email index if exists
        const emailIndex = indexes.find(index => 
            index.key && index.key.email !== undefined
        );
        
        if (emailIndex) {
            console.log('Found email index:', emailIndex.name);
            await collection.dropIndex(emailIndex.name);
            console.log('Successfully dropped email index');
        } else {
            console.log('No email index found');
        }
        
        // Verify indexes after dropping
        const updatedIndexes = await collection.indexes();
        console.log('Updated indexes:', updatedIndexes);
        
        // Close connection
        mongoose.connection.close();
        console.log('MongoDB connection closed');
    } catch (error) {
        console.error('Error dropping index:', error);
    } finally {
        process.exit(0);
    }
} 