const mongoose = require('mongoose');
const Parent = require('./models/Parent_apply');

// MongoDB connection string - adjust if needed
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tution_db';

async function fixDuplicateApplicationNumbers() {
  try {
    console.log('Connecting to MongoDB at:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all documents, sorted by _id (creation time) to preserve chronological order
    const parents = await Parent.find().sort({ _id: 1 });
    console.log(`Found ${parents.length} parent documents`);

    // Find highest application number to start from
    let maxAppNumber = 0;
    const usedNumbers = new Set();
    const duplicates = [];

    // First pass: identify duplicates and find max number
    for (const parent of parents) {
      if (!parent.applicationNumber) continue;
      
      if (usedNumbers.has(parent.applicationNumber)) {
        duplicates.push(parent);
      } else {
        usedNumbers.add(parent.applicationNumber);
        maxAppNumber = Math.max(maxAppNumber, parent.applicationNumber);
      }
    }

    console.log(`Highest application number: ${maxAppNumber}`);
    console.log(`Found ${duplicates.length} parents with duplicate application numbers`);

    // Second pass: fix duplicates
    let newAppNumber = maxAppNumber + 1;
    for (const parent of duplicates) {
      console.log(`Updating parent ${parent._id} from number ${parent.applicationNumber} to ${newAppNumber}`);
      await Parent.updateOne(
        { _id: parent._id },
        { $set: { applicationNumber: newAppNumber } }
      );
      newAppNumber++;
    }

    console.log('Finished fixing duplicate application numbers');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDuplicateApplicationNumbers(); 