const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs'); // NIEUW: Module om bestanden te lezen/schrijven
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = 'data.json'; // Het bestand waar we alles in opslaan

app.use(cors());
app.use(express.json());
// NIEUW: We vertellen Express dat de map 'public' bestanden mag serveren (voor je dashboard straks)
app.use(express.static('public')); 

// NIEUW: Bij het opstarten laden we de oude data in
let pageViews = [];
if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE);
    pageViews = JSON.parse(rawData);
    console.log(`${pageViews.length} eerdere pageviews geladen.`);
}

function generateDailyHash(ip, userAgent) {
    const secret = 'GEHEIM_VAN_DE_DAG_' + new Date().toISOString().slice(0, 10);
    return crypto.createHmac('sha256', secret).update(ip + userAgent).digest('hex');
}

app.post('/api/collect', (req, res) => {
    const { url, referrer } = req.body;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip; 
    const visitorId = generateDailyHash(ip, userAgent);

    const view = {
        visitorId: visitorId,
        url: url,
        referrer: referrer || 'Direct',
        timestamp: new Date()
    };

    pageViews.push(view);

    // NIEUW: We schrijven direct naar het bestand (simpel, maar werkt voor nu)
    fs.writeFileSync(DATA_FILE, JSON.stringify(pageViews, null, 2));
    
    console.log('Nieuwe pageview opgeslagen!');
    res.status(200).send('Data ontvangen');
});

app.get('/api/stats', (req, res) => {
    res.json(pageViews); // Stuur gewoon de hele array terug
});

app.listen(PORT, () => {
    console.log(`Analytics server draait op http://localhost:${PORT}`);
});