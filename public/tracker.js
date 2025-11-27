(function() {
    // 1. Sessie Management (Bestaat zolang de tab open is)
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
        // Maak een random ID voor deze nieuwe sessie
        sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('analytics_session_id', sessionId);
    }

    let viewId = null; // Dit wordt het ID van de huidige pageview in de database

    // 2. Functie om data te sturen
    function sendData(type) {
        const data = {
            type: type, // 'pageview' of 'ping'
            url: window.location.href,
            referrer: document.referrer,
            sessionId: sessionId,
            viewId: viewId // Sturen we mee bij pings
        };

        // Let op: vervang JOUW-URL hieronder als je live gaat!
        // Gebruik window.location.origin als de tracker op dezelfde server staat, 
        // of je volledige https://... onrender url.
        const apiUrl = 'https://tedlytics.onrender.com/api/collect'; 

        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(res => res.json())
        .then(response => {
            // Als we een nieuwe pageview stuurden, krijgen we een ID terug
            if (type === 'pageview' && response.id) {
                viewId = response.id;
            }
        })
        .catch(e => console.error('Analytics error:', e));
    }

    // 3. Starten maar!
    window.addEventListener('load', function() {
        sendData('pageview');

        // 4. De Hartslag: Elke 5 seconden een ping sturen als we een viewId hebben
        setInterval(() => {
            if (viewId && document.visibilityState === 'visible') {
                sendData('ping');
            }
        }, 5000);
    });
})();