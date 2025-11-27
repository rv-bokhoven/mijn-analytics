const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const UAParser = require('ua-parser-js'); 
const geoip = require('geoip-lite'); // NIEUW: De landkaart
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// NIEUW: Belangrijk voor Render! 
// Dit zorgt dat we het échte IP krijgen, niet dat van de Render load balancer.
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

// --- DATABASE ---
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ Verbonden met MongoDB Atlas'))
        .catch(err => console.error('❌ Fout:', err));
}

// Schema uitgebreid met 'country'
const PageViewSchema = new mongoose.Schema({
    visitorId: String,
    sessionId: String,
    url: String,
    referrer: String,
    browser: String,
    os: String,
    device: String,
    country: String, // NIEUW
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }
});

const PageView = mongoose.models.PageView || mongoose.model('PageView', PageViewSchema);

function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

// --- ROUTES ---
app.get('/tracker.js', (req, res) => res.sendFile(__dirname + '/public/tracker.js'));

app.post('/api/collect', async (req, res) => {
    try {
        const { type, url, referrer, sessionId, viewId } = req.body;
        
        if (type === 'ping' && viewId) {
            await PageView.findByIdAndUpdate(viewId, { $inc: { duration: 5 } });
            return res.status(200).json({ status: 'updated' });
        }

        const userAgent = req.headers['user-agent'] || '';
        const ua = UAParser(userAgent);
        const browserName = ua.browser.name || 'Onbekend';
        const osName = ua.os.name || 'Onbekend';
        const deviceType = ua.device.type || 'desktop';

        // IP Ophalen & Land bepalen
        const ip = req.ip; 
        const geo = geoip.lookup(ip); // Zoek op in database
        const country = geo ? geo.country : 'Onbekend'; // Geeft bijv 'NL' of null

        const visitorId = generateDailyHash(ip, userAgent);

        const newView = new PageView({
            visitorId, sessionId, url, 
            referrer: referrer || 'Direct',
            browser: browserName,
            os: osName,
            device: deviceType,
            country: country, // Opslaan!
            duration: 0
        });

        const savedView = await newView.save();
        res.status(200).json({ id: savedView._id });

    } catch (error) { res.status(500).send('Error'); }
});

// --- BEVEILIGD ---
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