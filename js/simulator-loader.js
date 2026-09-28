(() => {
    const showError = (message) => {
        document.getElementById('loading-panel').hidden = false;
        document.getElementById('loading-spinner').hidden = true;
        document.getElementById('loading-title').textContent = 'No se pudo iniciar el visor';
        document.getElementById('loading-message').textContent = message;
        document.getElementById('error-actions').hidden = false;
        document.getElementById('render-status').textContent = 'Visor no disponible';
        document.getElementById('stage').setAttribute('aria-busy', 'false');
        document.querySelector('.viewer').dataset.ready = 'false';
        document.querySelectorAll('.viewer-actions button, .zoom-actions button, .view-toolbar button, .view-toolbar input')
            .forEach((control) => { control.disabled = true; });
    };

    document.getElementById('retry').addEventListener('click', () => location.reload());
    document.getElementById('compatible').addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('renderer', 'webgl');
        location.href = url.href;
    });

    if (location.protocol === 'file:') {
        showError('Abre Simulador3D.html con Live Server. También puedes ejecutar python -m http.server 8080 desde la carpeta del proyecto y abrir http://localhost:8080/Simulador3D.html.');
        document.getElementById('compatible').hidden = true;
        return;
    }

    if (!HTMLScriptElement.supports?.('importmap')) {
        showError('Actualiza Chrome, Edge, Firefox o Safari para cargar el motor 3D. Puedes seguir consultando las fotografías desde el menú.');
        document.getElementById('compatible').hidden = true;
        return;
    }

    const timeout = setTimeout(() => {
        showError('La carga está tardando demasiado. Prueba el modo compatible o vuelve a intentar. Comprueba que el servidor siga abierto.');
    }, 30000);

    import('./simulator.js')
        .then(({ startSimulator }) => startSimulator(showError))
        .catch((error) => {
            console.error('Simulador 3D:', error);
            showError('No se pudo cargar el motor 3D. Comprueba que las carpetas js y vendor estén junto al archivo HTML y que la aceleración gráfica esté habilitada. Prueba el modo compatible.');
        })
        .finally(() => clearTimeout(timeout));
})();
