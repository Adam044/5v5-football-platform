/**
 * 5v5 Global Page Loader (Production Redesign)
 * - Professional logo spinner
 * - Minimalist white/blurred backdrop
 * - Smooth state transitions
 */
(function () {
    const CSS = `
    #page-loader {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.4s;
    }
    #page-loader.hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
    }
    .loader-container {
        position: relative;
        width: 100px;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .loader-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #10b981;
        border-radius: 50%;
        animation: logoSpin 1s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite;
    }
    .loader-logo {
        width: 60px;
        height: 60px;
        object-fit: contain;
        border-radius: 50%;
        background: white;
        padding: 5px;
        z-index: 2;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    @keyframes logoSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    `;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Build loader DOM
    const loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.innerHTML = `
        <div class="loader-container">
            <div class="loader-ring"></div>
            <img src="/components/images/logo.jpg" class="loader-logo" alt="5v5">
        </div>
    `;

    function injectLoader() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', injectLoader);
            return;
        }
        if (document.getElementById('page-loader')) return;
        document.body.prepend(loader);
    }

    injectLoader();

    // Fade out logic
    function hideLoader() {
        // Ensure a minimum show time for visual consistency
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 150);
    }

    function showLoader() {
        loader.classList.remove('hidden');
    }

    // Expose for manual control (e.g., admin dashboard data fetching)
    window.GlobalLoader = {
        show: showLoader,
        hide: hideLoader
    };

    // Handle back-forward cache restoration
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            hideLoader();
        }
    });

    if (document.readyState === 'complete') {
        hideLoader();
    } else {
        window.addEventListener('load', hideLoader);
        // Safety timeout
        setTimeout(hideLoader, 2500);
    }

    // Logic for internal page transitions
    document.addEventListener('click', function (e) {
        const a = e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href');
        // Filter out non-navigation links
        if (!href || href.startsWith('#') || href.startsWith('javascript') ||
            href.startsWith('mailto') || href.startsWith('tel') ||
            a.target === '_blank' || a.hasAttribute('download')) return;

        try {
            const url = new URL(href, location.href);
            if (url.origin !== location.origin) return;
        } catch { return; }

        showLoader();
    });
})();
