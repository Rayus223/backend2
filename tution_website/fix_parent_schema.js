const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/tution_db', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('Connected to MongoDB');
    
    try {
        // Access the database directly
        const db = mongoose.connection.db;
        
        // List all collections
        const collections = await db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
        
        // List indexes on the parents collection
        const indexes = await db.collection('parents').indexes();
        console.log('Indexes on parents collection:', indexes);
        
        // Find email index if it exists
        const emailIndex = indexes.find(index => index.key && index.key.email !== undefined);
        
        if (emailIndex) {
            console.log('Found email index, dropping it:', emailIndex.name);
            await db.collection('parents').dropIndex(emailIndex.name);
            console.log('Successfully dropped email index');
        } else {
            console.log('No email index found');
        }
        
        // Create a new version of the schema without the unique constraint
        console.log('Creating new version of the schema...');
        
        console.log('Done!');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Close the connection
        mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}).catch(err => {
    console.error('MongoDB connection error:', err);
}); 