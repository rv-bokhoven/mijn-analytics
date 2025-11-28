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
const { countryCodeEmoji } = require('country-code-emoji');

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

// Het Schema aanpassen met timestamps
const PageViewSchema = new mongoose.Schema({
    visitorId: String,
    sessionId: String,
    url: String,
    referrer: String,
    browser: String,
    os: String,
    device: String,
    country: String,
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }
}, { timestamps: true }); // <--- HIER IS DE MAGIC (Let op de accolade en komma!)

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

// IP Ophalen & Land bepalen MET Vlaggetje
        const ip = req.ip; 
        const geo = geoip.lookup(ip);
        
        let country = 'Onbekend';
        
        if (geo && geo.country) {
            try {
                // Probeer er een vlaggetje van te maken (bijv: "🇳🇱 NL")
                const flag = countryCodeEmoji(geo.country);
                country = `${flag} ${geo.country}`;
            } catch (e) {
                // Als het vlaggetje mislukt, doe dan alleen de letters (bijv: "NL")
                country = geo.country;
            }
        }

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

// REAL-TIME: Hoeveel mensen zijn er NU?
app.get('/api/realtime', async (req, res) => {
    try {
        // Bereken het tijdstip van 3 minuten geleden
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

        // Tel iedereen die ná dat tijdstip nog een update (ping/view) heeft gehad
        // We tellen unieke sessie ID's (zodat 1 persoon met 2 tabbladen als 1 telt)
        const activeSessions = await PageView.distinct('sessionId', {
            updatedAt: { $gte: threeMinutesAgo }
        });

        res.json({ visitors: activeSessions.length });
    } catch (error) {
        res.status(500).json({ error: 'Realtime error' });
    }
});

// Data ophalen met Datum Filter
app.get('/api/stats', async (req, res) => {
    try {
        const { from, to } = req.query;
        const query = {};

        // Als er een datum is meegegeven, voegen we een filter toe
        if (from || to) {
            query.timestamp = {};
            if (from) {
                // $gte betekent: Greater Than or Equal (Groter of gelijk aan)
                query.timestamp.$gte = new Date(from);
            }
            if (to) {
                // $lte betekent: Less Than or Equal (Kleiner of gelijk aan)
                // We zetten de tijd op 23:59:59 van die dag om de hele dag mee te pakken
                const endDate = new Date(to);
                endDate.setHours(23, 59, 59, 999);
                query.timestamp.$lte = endDate;
            }
        }

        // We zoeken met het filter (of leeg object als we alles willen)
        // En we sorteren op datum (oud naar nieuw) voor de grafiek
        const allViews = await PageView.find(query).sort({ timestamp: 1 });
        
        res.json(allViews);
    } catch (error) {
        res.status(500).json({ error: 'Kon data niet ophalen' });
    }
});

app.use(express.static('public'));
app.listen(PORT, () => console.log(`Server draait op ${PORT}`));