const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth'); // De nieuwe bewaker
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTIE ---
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Verbonden met MongoDB Atlas'))
        .catch(err => console.error('❌ Database fout:', err));
}

const PageView = mongoose.model('PageView', new mongoose.Schema({
    visitorId: String,
    url: String,
    referrer: String,
    timestamp: { type: Date, default: Date.now }
}));

function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

// ==========================================
// 🟢 ZONE 1: OPENBAAR (Iedereen mag hierbij)
// ==========================================

// 1. Het tracker bestand (anders kan niemand het laden)
app.get('/tracker.js', (req, res) => {
    res.sendFile(__dirname + '/public/tracker.js');
});

// 2. Data ontvangen (anders kan niemand data sturen)
app.post('/api/collect', async (req, res) => {
    try {
        const { url, referrer } = req.body;
        const userAgent = req.headers['user-agent'] || 'onbekend';
        const visitorId = generateDailyHash(req.ip, userAgent);
        await new PageView({ visitorId, url, referrer }).save();
        res.status(200).send('Ok');
    } catch (error) { res.status(500).send('Error'); }
});

// ==========================================
// 🔴 ZONE 2: BEVEILIGD (Wachtwoord nodig)
// ==========================================

// Vanaf hier staat het hek dicht!
app.use(basicAuth({
    users: { 'admin': process.env.ADMIN_PASSWORD || 'geheim123' },
    challenge: true
}));

// Het dashboard data-punt
app.get('/api/stats', async (req, res) => {
    const allViews = await PageView.find();
    res.json(allViews);
});

// De dashboard pagina zelf
app.use(express.static('public')); 

app.listen(PORT, () => console.log(`Server draait op ${PORT}`));