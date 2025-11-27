(function() {
    // We wachten even tot de pagina geladen is
    window.addEventListener('load', function() {
        const data = {
            url: window.location.href,
            referrer: document.referrer
        };

        // We sturen de data naar jouw server
        // Let op: als je dit live zet, moet 'http://localhost:3000' jouw echte domein worden
        fetch('https://tedlytics.onrender.com/api/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(() => {
            console.log('Analytics data verstuurd!');
        }).catch(err => {
            console.error('Fout bij versturen analytics:', err);
        });
    });
})();