const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose'); 
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- DATABASE VERBINDING ---
const mongoURI = process.env.MONGO_URI;

if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Verbonden met MongoDB Atlas'))
        .catch(err => console.error('❌ Database fout:', err));
} else {
    console.log('⚠️ Geen database link gevonden! Check je .env bestand.');
}

// --- HET DATABASE MODEL ---
const PageViewSchema = new mongoose.Schema({
    visitorId: String,
    url: String,
    referrer: String,
    timestamp: { type: Date, default: Date.now }
});

const PageView = mongoose.model('PageView', PageViewSchema);

// --- HASH FUNCTIE ---
function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_VAN_DE_DAG_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

// --- ROUTES ---

// 1. Data opslaan
app.post('/api/collect', async (req, res) => {
    try {
        const { url, referrer } = req.body;
        const userAgent = req.headers['user-agent'] || 'onbekend';
        const ip = req.ip; 
        const visitorId = generateDailyHash(ip, userAgent);

        const newView = new PageView({
            visitorId: visitorId,
            url: url,
            referrer: referrer || 'Direct',
        });

        await newView.save();
        console.log('Nieuwe view opgeslagen in MongoDB!');
        res.status(200).send('Data ontvangen');
    } catch (error) {
        console.error('Fout bij opslaan:', error);
        res.status(500).send('Server fout');
    }
});

// 2. Data ophalen
app.get('/api/stats', async (req, res) => {
    try {
        const allViews = await PageView.find();
        res.json(allViews);
    } catch (error) {
        res.status(500).json({ error: 'Kon data niet ophalen' });
    }
});

app.listen(PORT, () => {
    console.log(`Analytics server draait op poort ${PORT}`);
});