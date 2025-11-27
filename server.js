const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const UAParser = require('ua-parser-js'); // NIEUW: De vertaalmachine
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- DATABASE ---
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Verbonden met MongoDB Atlas'))
        .catch(err => console.error('❌ Fout:', err));
}

// NIEUW: Uitgebreid Schema met device info
const PageViewSchema = new mongoose.Schema({
    visitorId: String,
    sessionId: String,
    url: String,
    referrer: String,
    browser: String,  // Nieuw
    os: String,       // Nieuw
    device: String,   // Nieuw (mobile, tablet, desktop)
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }
});

const PageView = mongoose.models.PageView || mongoose.model('PageView', PageViewSchema);

function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

// --- OPENBARE ROUTES ---
app.get('/tracker.js', (req, res) => res.sendFile(__dirname + '/public/tracker.js'));

app.post('/api/collect', async (req, res) => {
    try {
        const { type, url, referrer, sessionId, viewId } = req.body;
        
        // Ping update
        if (type === 'ping' && viewId) {
            await PageView.findByIdAndUpdate(viewId, { $inc: { duration: 5 } });
            return res.status(200).json({ status: 'updated' });
        }

        // Nieuwe Pageview
        const userAgent = req.headers['user-agent'] || '';
        
        // NIEUW: Parse de User Agent
        const ua = UAParser(userAgent);
        const browserName = ua.browser.name || 'Onbekend';
        const osName = ua.os.name || 'Onbekend';
        // ua-parser geeft 'undefined' voor desktop, dus dat vullen we zelf in:
        const deviceType = ua.device.type || 'desktop'; 

        const ip = req.ip; 
        const visitorId = generateDailyHash(ip, userAgent);

        const newView = new PageView({
            visitorId, sessionId, url, 
            referrer: referrer || 'Direct',
            browser: browserName,
            os: osName,
            device: deviceType,
            duration: 0
        });

        const savedView = await newView.save();
        res.status(200).json({ id: savedView._id });

    } catch (error) { res.status(500).send('Error'); }
});

// --- BEVEILIGDE ROUTES ---
app.use(basicAuth({
    users: { 'admin': process.env.ADMIN_PASSWORD || 'geheim123' },
    challenge: true
}));

app.get('/api/stats', async (req, res) => {
    const allViews = await PageView.find();
    res.json(allViews);
});

app.use(express.static('public'));

app.listen(PORT, () => console.log(`Server draait op ${PORT}`));