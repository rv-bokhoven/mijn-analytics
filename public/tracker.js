(function() {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
        sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('analytics_session_id', sessionId);
    }
    let viewId = null;

    // ⚠️ PAS DIT AAN NAAR JOUW RENDER URL
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

        // Console log om te debuggen (Alleen lokaal zichtbaar)
        console.log(`📡 Versturen [${type}]:`, extraData);

        if (navigator.sendBeacon && type === 'event') {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            navigator.sendBeacon(API_URL, blob);
        } else {
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).then(res => res.json()).then(res => {
                if (type === 'pageview') viewId = res.id;
            }).catch(e => console.error('Tracker Error:', e));
        }
    }

    window.addEventListener('load', function() {
        sendData('pageview');
        setInterval(() => { if (viewId && document.visibilityState === 'visible') sendData('ping'); }, 5000);
        enableAutoTracking();
    });

    function enableAutoTracking() {
        document.addEventListener('click', function(event) {
            const target = event.target;
            const el = target.closest('a, button, input[type="submit"]');

            if (!el) return;

            // 1. Handmatige data-event (Heeft voorrang)
            if (el.getAttribute('data-event')) {
                sendData('event', { eventName: el.getAttribute('data-event') });
                return;
            }

            // 2. Links (<a>)
            if (el.tagName === 'A') {
                const href = el.getAttribute('href');
                if (!href) return;

                // Speciale links (Mail, Tel)
                if (href.startsWith('mailto:') || href.startsWith('tel:')) {
                    sendData('event', { eventName: 'Contact Klik' });
                    return;
                }

                // Downloads
                const ext = href.split('.').pop().toLowerCase();
                if (['pdf', 'zip', 'docx'].includes(ext)) {
                    sendData('event', { eventName: 'Download: ' + ext.toUpperCase() });
                    return;
                }

                // Externe Links
                if (el.hostname && el.hostname !== window.location.hostname) {
                    sendData('event', { eventName: 'Outbound: ' + el.hostname });
                    return;
                }

                // Interne Links (Nieuw! We tracken de tekst)
                // We sturen dit alleen als het GEEN menu navigatie is (optioneel)
                // Maar voor nu sturen we gewoon ALLES wat tekst heeft.
                const text = el.innerText.trim();
                if (text) {
                    sendData('event', { eventName: 'Klik: ' + text });
                }
            }

            // 3. Knoppen (<button>)
            if (el.tagName === 'BUTTON') {
                const text = el.innerText.trim() || 'Knop';
                sendData('event', { eventName: 'Klik: ' + text });
            }
        });
    }
})();