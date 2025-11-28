(function() {
    // Sessie Logica
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
        sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('analytics_session_id', sessionId);
    }
    let viewId = null;

    // De functie die data stuurt
    function sendData(type, extraData = {}) {
        const data = {
            type: type,
            url: window.location.href,
            referrer: document.referrer,
            sessionId: sessionId,
            viewId: viewId,
            ...extraData // Hier komen eventNames in terecht
        };

        // PAS DEZE URL AAN NAAR JOUW RENDER URL!
        const apiUrl = 'https://tedlytics.onrender.com/api/collect'; 

        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(res => res.json())
        .then(response => {
            if (type === 'pageview' && response.id) viewId = response.id;
        })
        .catch(e => console.error(e));
    }

    // 1. Automatische Pageview bij laden
    window.addEventListener('load', function() {
        sendData('pageview');
        // Hartslag
        setInterval(() => {
            if (viewId && document.visibilityState === 'visible') sendData('ping');
        }, 5000);
    });

    // 2. NIEUW: De functie blootstellen aan de window
    // Hierdoor kun je in je HTML zeggen: tedlytics('Klik')
    window.tedlytics = function(eventName) {
        console.log('Event verstuurd:', eventName);
        sendData('event', { eventName: eventName });
    };

})();