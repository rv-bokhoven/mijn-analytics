(function() {
    // 1. Sessie & Basis Setup
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
        sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('analytics_session_id', sessionId);
    }
    let viewId = null;

    // ⚠️ PAS DIT AAN NAAR JOUW URL
    const API_URL = 'https://tedlytics.onrender.com/api/collect'; 

    function sendData(type, extraData = {}) {
        const data = {
            type: type,
            url: window.location.href,
            referrer: document.referrer,
            sessionId: sessionId,
            viewId: viewId,
            ...extraData
        };

        if (navigator.sendBeacon && type === 'event') {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            navigator.sendBeacon(API_URL, blob);
        } else {
            fetch(API_URL, {
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
    }

    // 2. Initialisatie
    window.addEventListener('load', function() {
        sendData('pageview');
        
        setInterval(() => {
            if (viewId && document.visibilityState === 'visible') sendData('ping');
        }, 5000);
        
        enableAutoTracking();
    });

    // 3. DE "MAGISCHE" AUTO-TRACKER 🪄
    function enableAutoTracking() {
        document.addEventListener('click', function(event) {
            const target = event.target;
            
            // We zoeken naar het dichtstbijzijnde klikbare element (voor het geval je op een icoontje in een knop klikt)
            const el = target.closest('a, button, input[type="submit"], input[type="button"]');

            if (!el) return; // Er is nergens op geklikt wat ons boeit

            // A. Check voor handmatige overrides (data-event gaat voor alles)
            if (el.getAttribute('data-event')) {
                sendData('event', { eventName: el.getAttribute('data-event') });
                return;
            }

            // B. Links (<a> tags)
            if (el.tagName === 'A') {
                const href = el.getAttribute('href');
                if (!href) return;

                // 1. Externe Links
                if (el.hostname !== window.location.hostname && href.startsWith('http')) {
                    sendData('event', { eventName: 'Outbound Link: ' + el.hostname });
                    return;
                }

                // 2. Mailto / Tel
                if (href.startsWith('mailto:')) {
                    sendData('event', { eventName: 'Email Click' }); 
                    return;
                }
                
                // 3. Bestandsdownloads (PDF, ZIP, etc)
                const extension = href.split('.').pop().toLowerCase();
                if (['pdf', 'zip', 'docx', 'xlsx', 'csv'].includes(extension)) {
                    sendData('event', { eventName: 'Download: ' + extension.toUpperCase() });
                    return;
                }
            }

            // C. Knoppen (<button> of <input>)
            // Als het geen link is, maar wel een knop, tracken we de TEKST van de knop.
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                // Haal de tekst op (bijv "Koop Nu" of value="Verzend")
                let buttonText = el.innerText || el.value || 'Onbekende Knop';
                buttonText = buttonText.trim(); // Spaties weghalen

                if (buttonText) {
                    sendData('event', { eventName: 'Klik: ' + buttonText });
                }
            }
        });
    }

})();