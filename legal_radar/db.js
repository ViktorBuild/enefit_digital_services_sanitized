const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in environment variables for Legal Radar.');
    process.exit(1);
}

const client = new MongoClient(uri);
let db;

async function connectDB() {
    if (!db) {
        await client.connect();
        db = client.db("valeri_db");
        console.log("Legal Radar connected to shared MongoDB (valeri_db)");
        
        // Create indexes
        await db.collection('radar_laws').createIndex({ id: 1 }, { unique: true });
        await db.collection('radar_subscribers').createIndex({ email: 1 }, { unique: true });
        await db.collection('radar_settings').createIndex({ key: 1 }, { unique: true });
    }
    return db;
}

async function saveLaw(law) {
    const database = await connectDB();
    try {
        await database.collection('radar_laws').insertOne(law);
        return true;
    } catch (err) {
        if (err.code === 11000) {
            return false; // Already exists
        }
        throw err;
    }
}

async function lawExists(id) {
    const database = await connectDB();
    const doc = await database.collection('radar_laws').findOne({ id });
    return !!doc;
}

async function getRecentLaws(limit = 50) {
    const database = await connectDB();
    return await database.collection('radar_laws')
        .find()
        .sort({ pubDate: -1 })
        .limit(limit)
        .toArray();
}

async function getUnsentLaws() {
    const database = await connectDB();
    return await database.collection('radar_laws')
        .find({ is_sent: 0 })
        .toArray();
}

async function markLawsAsSent() {
    const database = await connectDB();
    await database.collection('radar_laws').updateMany(
        { is_sent: 0 },
        { $set: { is_sent: 1 } }
    );
}

async function addSubscriber(email, categoriesArray) {
    const database = await connectDB();
    await database.collection('radar_subscribers').updateOne(
        { email },
        { $set: { email, categories: JSON.stringify(categoriesArray) } },
        { upsert: true }
    );
}

async function getSubscribers() {
    const database = await connectDB();
    const subs = await database.collection('radar_subscribers').find().toArray();
    return subs.map(s => {
        try {
            s.categories = JSON.parse(s.categories);
        } catch(e) {
            s.categories = [];
        }
        return s;
    });
}

async function setSetting(key, value) {
    const database = await connectDB();
    await database.collection('radar_settings').updateOne(
        { key },
        { $set: { key, value } },
        { upsert: true }
    );
}

async function getSetting(key, defaultValue) {
    const database = await connectDB();
    const doc = await database.collection('radar_settings').findOne({ key });
    return doc ? doc.value : defaultValue;
}

async function factoryReset() {
    const database = await connectDB();
    await database.collection('radar_laws').deleteMany({});
    await database.collection('radar_subscribers').deleteMany({});
    await database.collection('radar_settings').deleteMany({});
}

async function deleteSubscriber(email) {
    const database = await connectDB();
    await database.collection('radar_subscribers').deleteOne({ email });
}

module.exports = {
    connectDB,
    saveLaw,
    lawExists,
    getRecentLaws,
    getUnsentLaws,
    markLawsAsSent,
    addSubscriber,
    getSubscribers,
    setSetting,
    getSetting,
    factoryReset,
    deleteSubscriber
};
