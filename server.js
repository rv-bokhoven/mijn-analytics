console.log("🚀 START: Ik begin met het lezen van de code...");

const express = require('express');
console.log("✅ Express geladen");
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
console.log("✅ Mongoose geladen");
const basicAuth = require('express-basic-auth');
const UAParser = require('ua-parser-js'); 
console.log("✅ UAParser geladen");
const geoip = require('geoip-lite');
console.log("✅ GeoIP geladen (Dit was waarschijnlijk de boosdoener!)");
const { countryCodeEmoji } = require('country-code-emoji'); 
const path = require('path');
require('dotenv').config();

console.log("👉 Stap 1: Alle modules zijn succesvol ingeladen!");

const app = express();
const PORT = process.env.PORT || 3000;

// 1. PROXY TRUST (Voor Render/GeoIP)
app.set('trust proxy', true);

// 2. CORS (Beveiliging)
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));

// 3. BODY PARSER
app.use(express.json()); 

// --- DATABASE VERBINDING ---
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
    console.log("⏳ DATABASE: Ik ga nu proberen te verbinden met MongoDB...");
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ DATABASE: Verbonden met MongoDB Atlas'))
        .catch(err => console.error('❌ DATABASE FOUT:', err));
} else {
    console.log("⚠️ LET OP: Geen MONGO_URI gevonden in je .env bestand!");
}

// --- DATAMODEL ---
const PageViewSchema = new mongoose.Schema({
    visitorId: String,
    sessionId: String,
    url: String,
    referrer: String,
    browser: String,
    os: String,
    device: String,
    country: String,
    eventName: String, 
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }
}, { timestamps: true });

const PageView = mongoose.models.PageView || mongoose.model('PageView', PageViewSchema);

// --- HULPFUNCTIES ---
function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

// --- OPEN ROUTES (Voor bezoekers) ---

// 1. Tracker script serveren
app.get('/tracker.js', (req, res) => {
    res.sendFile(__dirname + '/public/tracker.js');
});

// 2. Data Verzamelen
app.post('/api/collect', async (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ error: 'Geen data ontvangen' });

        const { type, url, referrer, sessionId, viewId, eventName } = req.body;
        
        if (type === 'ping' && viewId) {
            await PageView.findByIdAndUpdate(viewId, { $inc: { duration: 5 } });
            return res.status(200).json({ status: 'updated' });
        }

        const userAgent = req.headers['user-agent'] || '';
        const ua = UAParser(userAgent);
        const browserName = ua.browser.name || 'Onbekend';
        const osName = ua.os.name || 'Onbekend';
        const deviceType = ua.device.type || 'desktop';

        let country = 'Onbekend';
        try {
            const ip = req.ip; 
            const geo = geoip.lookup(ip);
            if (geo && geo.country) {
                try { 
                    const flag = countryCodeEmoji(geo.country); 
                    country = `${flag} ${geo.country}`; 
                } catch (e) { 
                    country = geo.country; 
                }
            }
        } catch (e) { console.log('GeoIP error:', e.message); }

        const ip = req.ip; 
        const visitorId = generateDailyHash(ip, userAgent);

        const newView = new PageView({
            visitorId, sessionId, url, 
            referrer: referrer || 'Direct',
            browser: browserName,
            os: osName,
            device: deviceType,
            country: country,
            eventName: type === 'event' ? eventName : null,
            duration: 0
        });

        const savedView = await newView.save();
        res.status(200).json({ id: savedView._id });

    } catch (error) {
        console.error('❌ Server Error in /api/collect:', error);
        res.status(500).json({ error: 'Interne server fout' });
    }
});


// --- BEVEILIGD GEDEELTE (Alleen voor jou) ---
app.use(basicAuth({
    users: { 'admin': process.env.ADMIN_PASSWORD || 'geheim123' },
    challenge: true
}));

// Dashboard Data API (Veilig achter wachtwoord)
app.get('/api/stats', async (req, res) => {
    try {
        const { from, to, filterType, filterValue } = req.query;
        const query = {};

        if (from || to) {
            query.timestamp = {};
            if (from) query.timestamp.$gte = new Date(from);
            if (to) {
                const endDate = new Date(to);
                endDate.setHours(23, 59, 59, 999);
                query.timestamp.$lte = endDate;
            }
        }

        if (filterType && filterValue) {
            const decodedValue = decodeURIComponent(filterValue);
            if (filterType === 'url') {
                query[filterType] = { $regex: decodedValue, $options: 'i' };
            } else {
                query[filterType] = decodedValue;
            }
        }

        const allViews = await PageView.find(query).sort({ timestamp: 1 });
        res.json(allViews);
    } catch (error) { res.status(500).json({ error: 'Kon data niet ophalen' }); }
});

// Realtime Data API (Voor het knipperende bolletje)
app.get('/api/realtime', async (req, res) => {
    try {
        // Bereken de tijd van 5 minuten geleden
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        // Vraag aan de database hoeveel UNIEKE sessies er sinds die tijd actief waren
        const activeSessions = await PageView.distinct('visitorId', {
            timestamp: { $gte: fiveMinsAgo }
        });
        
        // Stuur het aantal terug naar het dashboard
        res.json({ visitors: activeSessions.length });
    } catch (error) { 
        res.status(500).json({ visitors: 0 }); 
    }
});

// Statische bestanden (Dashboard)
app.use(express.static('public'));

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// --- SERVER STARTEN ---
app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 TEDLYTICS IS SUCCESVOL OPGESTART!`);
    console.log(`📊 Bekijk je dashboard lokaal via: http://localhost:${PORT}/dashboard`);
    console.log(`=========================================\n`);
});