const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
    applicationNumber: {
        type: Number,
        unique: true,
        sparse: true
    },
    parentName: {
        type: String,
        required: [true, 'Parent name is required']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required']
    },
    address: {
        type: String,
        required: [true, 'Address is required']
    },
    salary: {
        type: String,
        required: false
    },
    preferredTeacher: {
        type: String,
        enum: ['male', 'female', 'any'],
        required: [true, 'Preferred teacher gender is required']
    },
    grade: {
        type: String,
        required: [true, 'Grade is required']
    },
    subjects: {
        type: [String],
        required: [true, 'At least one subject is required'],
        validate: {
            validator: function(v) {
                return v.length > 0 && v.length <= 3;
            },
            message: 'Please select between 1 and 3 subjects'
        }
    },
    preferredTime: {
        type: String,
        required: [true, 'Preferred time is required']
    },
    submissionDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['new', 'pending', 'done', 'not_done'],
        default: 'new'
    },
    vacancyDetails: {
        vacancyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vacancy',
            default: null
        },
        rejectedCount: {
            type: Number,
            default: 0
        },
        createdAt: Date
    }
});

// Do NOT add any index on email field
// Fixed schema to have applicationNumber as a direct property, not nested

parentSchema.pre('save', async function(next) {
    try {
        if (!this.applicationNumber) {
            // Try multiple times in case of concurrent operations
            let attempts = 0;
            let success = false;
            
            while (!success && attempts < 5) {
                attempts++;
                const lastParent = await this.constructor.findOne({}).sort({ applicationNumber: -1 });
                const nextNumber = lastParent && lastParent.applicationNumber 
                    ? lastParent.applicationNumber + 1 
                    : 1;
                
                // Check if this number is already used
                const existing = await this.constructor.findOne({ applicationNumber: nextNumber });
                if (!existing) {
                    this.applicationNumber = nextNumber;
                    success = true;
                    console.log(`Generated application number ${nextNumber} on attempt ${attempts}`);
                } else {
                    console.log(`Application number ${nextNumber} already exists, trying next number`);
                }
            }
            
            if (!success) {
                // Last resort - use timestamp to generate a unique large number
                const timestamp = new Date().getTime();
                this.applicationNumber = 10000 + (timestamp % 1000);
                console.log(`Used fallback application number: ${this.applicationNumber}`);
            }
        }
        next();
    } catch (error) {
        console.error('Error in pre-save:', error);
        next(error);
    }
});

const Parent = mongoose.model('Parent', parentSchema);

// Try to drop any existing email index asynchronously
(async () => {
    try {
        // This will run when the model is first imported
        const indexes = await Parent.collection.getIndexes();
        console.log('Current indexes:', indexes);
        
        for (const indexName in indexes) {
            const index = indexes[indexName];
            // Check if this is an email index
            if (index.email) {
                console.log(`Dropping index ${indexName}`);
                await Parent.collection.dropIndex(indexName);
            }
        }
    } catch (error) {
        console.error('Failed to drop index:', error);
        // Continue even if this fails
    }
})();

module.exports = Parent;