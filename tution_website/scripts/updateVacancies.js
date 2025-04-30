const mongoose = require('mongoose');
const Vacancy = require('../models/Vacancy');

async function updateVacancies() {
    try {
        // Connect to MongoDB with updated connection URL
        await mongoose.connect('mongodb://127.0.0.1:27017/tuition_website');

        console.log('Connected to MongoDB');

        // Find all vacancies
        const vacancies = await Vacancy.find({});
        console.log(`Found ${vacancies.length} vacancies to update`);

        // Update each vacancy
        for (const vacancy of vacancies) {
            // Update all vacancies with default values if fields are missing
            await Vacancy.findByIdAndUpdate(vacancy._id, {
                $set: {
                    class: vacancy.class || 'Not specified',
                    time: vacancy.time || 'Not specified',
                    location: vacancy.location || 'Not specified'
                }
            });
            console.log(`Updated vacancy: ${vacancy._id}`);
        }

        console.log('Finished updating vacancies');
        process.exit(0);
    } catch (error) {
        console.error('Error updating vacancies:', error);
        process.exit(1);
    }
}

updateVacancies(); 