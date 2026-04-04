require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smartattend';

const templateSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['checklist', 'form', 'agreement'], default: 'checklist' },
    content: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Template = mongoose.model('Template', templateSchema);

async function migrate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB connected');

        const jsonPath = path.join(__dirname, 'apf_checklists.json');
        if (!fs.existsSync(jsonPath)) {
            console.error('No apf_checklists.json found!');
            process.exit(1);
        }

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        let count = 0;

        for (const item of data) {
            const exists = await Template.findOne({ title: item.title });
            if (!exists) {
                await Template.create({
                    title: item.title,
                    type: 'checklist',
                    content: item.content || ''
                });
                console.log(`Saved: ${item.title}`);
                count++;
            } else {
                console.log(`Skipped existing: ${item.title}`);
            }
        }
        
        console.log(`\n🎉 Migration complete. Added ${count} new templates.`);
        
        // Let's delete the json file as requested by the user to avoid waste data
        fs.unlinkSync(jsonPath);
        console.log(`🗑️ Deleted apf_checklists.json to clean up waste.`);

        process.exit(0);
    } catch (e) {
        console.error('Error during migration:', e);
        process.exit(1);
    }
}

migrate();
