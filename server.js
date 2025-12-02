const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const UAParser = require('ua-parser-js'); 
const geoip = require('geoip-lite');
const { countryCodeEmoji } = require('country-code-emoji'); 
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. PROXY TRUST (Voor Render/GeoIP)
app.set('trust proxy', true);

// 2. CORS (Beveiliging)
// Dit zorgt dat je tracker mag praten met de server
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));

// 3. BODY PARSER (DIT WAS HET PROBLEEM!) 🚨
// Deze regel zorgt dat 'req.body' gevuld wordt met data.
// Hij MOET boven de routes staan.
app.use(express.json()); 

// --- DATABASE VERBINDING ---
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Verbonden met MongoDB Atlas'))
        .catch(err => console.error('❌ Fout:', err));
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
    eventName: String, // Voor je custom events
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }
}, { timestamps: true });

const PageView = mongoose.models.PageView || mongoose.model('PageView', PageViewSchema);

// --- HULPFUNCTIES ---
function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

// --- ROUTES ---

// 1. Tracker script serveren
app.get('/tracker.js', (req, res) => {
    res.sendFile(__dirname + '/public/tracker.js');
});

// 2. Data Verzamelen (Het hart van het systeem)
app.post('/api/collect', async (req, res) => {
    try {
        // Dubbele check: als req.body leeg is, stop dan direct om crash te voorkomen
        if (!req.body) {
            return res.status(400).json({ error: 'Geen data ontvangen' });
        }

        const { type, url, referrer, sessionId, viewId, eventName } = req.body;
        
        // Ping (Tijd update)
        if (type === 'ping' && viewId) {
            await PageView.findByIdAndUpdate(viewId, { $inc: { duration: 5 } });
            return res.status(200).json({ status: 'updated' });
        }

        // Info verzamelen
        const userAgent = req.headers['user-agent'] || '';
        const ua = UAParser(userAgent);
        const browserName = ua.browser.name || 'Onbekend';
        const osName = ua.os.name || 'Onbekend';
        const deviceType = ua.device.type || 'desktop';

        // GeoIP (Veilig verpakt in try/catch)
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

        // Opslaan
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

// 3. Real-Time API
// Dashboard Data API (Nu met filters!)
app.get('/api/stats', async (req, res) => {
    try {
        const { from, to, filterType, filterValue } = req.query;
        const query = {};

        // 1. Datum Filter
        if (from || to) {
            query.timestamp = {};
            if (from) query.timestamp.$gte = new Date(from);
            if (to) {
                const endDate = new Date(to);
                endDate.setHours(23, 59, 59, 999);
                query.timestamp.$lte = endDate;
            }
        }

        // 2. Drilldown Filter (AANGEPAST)
        if (filterType && filterValue) {
            const decodedValue = decodeURIComponent(filterValue);
            
            if (filterType === 'url') {
                // Zoek of de URL in de database dit pad BEVAT
                // $options: 'i' maakt het ongevoelig voor hoofdletters
                query[filterType] = { $regex: decodedValue, $options: 'i' };
            } else {
                // Exacte match voor landen, browsers, etc.
                query[filterType] = decodedValue;
            }
        }

        const allViews = await PageView.find(query).sort({ timestamp: 1 });
        res.json(allViews);
    } catch (error) { res.status(500).json({ error: 'Kon data niet ophalen' }); }
});

// --- BEVEILIGD GEDEELTE (Dashboard) ---
app.use(basicAuth({
    users: { 'admin': process.env.ADMIN_PASSWORD || 'geheim123' },
    challenge: true
}));

// Dashboard Data API
app.get('/api/stats', async (req, res) => {
    try {
        const { from, to } = req.query;
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

        const allViews = await PageView.find(query).sort({ timestamp: 1 });
        res.json(allViews);
    } catch (error) { res.status(500).json({ error: 'Kon data niet ophalen' }); }
});

// 1. Statische bestanden (plaatjes, scripts, css) mogen gewoon geladen worden
app.use(express.static('public'));

// 2. De Clean URL voor het dashboard
// Als iemand naar '/dashboard' gaat, stuur dan dashboard.html
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 3. Redirect (Optioneel)
// Als iemand per ongeluk naar de root '/' gaat, stuur ze door naar het dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

app.listen(PORT, () => console.log(`Analytics server draait op poort ${PORT}`));