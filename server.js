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

// --- HET DATABASE MODEL ---

// 1. Eerst de definitie (Het Schema)
const PageViewSchema = new mongoose.Schema({
    visitorId: String,
    sessionId: String,       // NIEUW: Om sessies te herkennen
    url: String,
    referrer: String,
    timestamp: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 } // NIEUW: Tijd op pagina
});

// 2. Dan het model maken
// (Let op: als je server herstart en klaagt over "OverwriteModelError", 
// gebruik dan deze veilige regel):
const PageView = mongoose.models.PageView || mongoose.model('PageView', PageViewSchema);

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
// Data verzamelen (Nu met ondersteuning voor Pings)
app.post('/api/collect', async (req, res) => {
    try {
        const { type, url, referrer, sessionId, viewId } = req.body;
        
        // Scenario A: Hartslag (Ping) -> Update de tijd
        if (type === 'ping' && viewId) {
            // Zoek de pageview en tel er 5 seconden bij op
            await PageView.findByIdAndUpdate(viewId, { $inc: { duration: 5 } });
            return res.status(200).json({ status: 'updated' });
        }

        // Scenario B: Nieuwe Pageview
        const userAgent = req.headers['user-agent'] || 'onbekend';
        const visitorId = generateDailyHash(req.ip, userAgent);

        const newView = new PageView({
            visitorId: visitorId,
            sessionId: sessionId, // Die slaan we nu op!
            url: url,
            referrer: referrer || 'Direct',
            duration: 0
        });

        const savedView = await newView.save();
        
        // We sturen het ID terug naar de tracker, zodat die kan pingen
        res.status(200).json({ id: savedView._id });

    } catch (error) {
        console.error('Opslag fout:', error);
        res.status(500).send('Error');
    }
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