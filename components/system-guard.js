(async function () {
    // 1. Immunity Check
    if (window.location.pathname.includes('/owner_panel/')) {
        return;
    }

    // 2. Fetch Status
    try {
        const res = await fetch('/api/public/system-status');
        const data = await res.json();

        const globalLock = data.global_lock;
        const pageLocks = data.page_locks;

        // 3. Determine Page ID
        const path = window.location.pathname;
        let pageId = 'unknown';
        if (path === '/' || path.includes('index.html')) pageId = 'index';
        else if (path.includes('auth.html')) pageId = 'auth';
        else if (path.includes('players.html')) pageId = 'players';
        else if (path.includes('fields.html')) pageId = 'fields';
        else if (path.includes('tournaments.html')) pageId = 'tournaments';
        else if (path.includes('profile.html')) pageId = 'profile';
        else if (path.includes('admin-dashboard.html') || path === '/admin' || path.includes('/admin/')) pageId = 'admin-dashboard';

        // 4. Logic
        if (globalLock && globalLock.is_locked) {
            showLockModal(globalLock.type, globalLock.message);
        } else if (pageLocks && pageLocks[pageId] && pageLocks[pageId].is_locked) {
            const lock = pageLocks[pageId];
            showLockModal(lock.type || 'page_locked', lock.message);
        }

    } catch (err) {
        console.error('System Guard Error:', err);
    }

    function showLockModal(type, customMessage) {
        // Prevent scrolling
        document.body.style.overflow = 'hidden';

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a] bg-opacity-95 backdrop-blur-sm';

        let content = '';

        // Common Contact Section
        const contactSection = `
            <div class="mt-8 pt-6 border-t border-gray-800/50 flex flex-col items-center">
                <button id="owner-contact-btn" class="group flex items-center gap-3 bg-gray-900/50 px-5 py-2.5 rounded-full border border-gray-800 hover:border-gray-600 hover:bg-gray-800 transition-all duration-300 cursor-pointer">
                    <div class="relative">
                         <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                         <div class="absolute inset-0 w-2 h-2 rounded-full bg-green-500 blur-sm animate-pulse"></div>
                    </div>
                    <span class="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Contact Platform Owner: Adam Hawash</span>
                </button>
            </div>
        `;

        if (type === 'cyber') {
            // Protocol 3: Security Restriction (Realistic 403)
            content = `
                <div class="font-sans text-gray-300 text-center p-8 md:p-12 max-w-lg w-full mx-4 relative">
                    <div class="mb-6">
                        <img src="/images/logo.jpg" class="h-16 w-16 mx-auto rounded-full border-2 border-red-900/50 shadow-lg grayscale opacity-80">
                    </div>
                    
                    <div class="mb-8 relative inline-block">
                        <div class="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
                        <i class="fa-solid fa-shield-halved text-6xl text-red-500 relative z-10"></i>
                    </div>

                    <h1 class="text-3xl font-bold mb-4 text-white tracking-tight">Access Restricted</h1>
                    
                    <div class="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-8">
                        <p class="text-red-400 text-sm font-medium mb-1">Error Code: 403 Forbidden</p>
                        <p class="text-gray-400 text-sm leading-relaxed">
                            ${customMessage || 'Your session has been flagged by our security systems. Access to this resource is currently suspended.'}
                        </p>
                    </div>

                    <p class="text-xs text-gray-600 font-mono mb-8">SESSION_ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                    
                    ${contactSection}
                </div>
            `;
        } else if (type === 'unavailable') {
            // Protocol 2: Administrative Pause (Realistic System Halt)
            content = `
                <div class="font-sans text-gray-300 text-center p-8 md:p-12 max-w-lg w-full mx-4">
                    <div class="mb-8">
                        <img src="/images/logo.jpg" class="h-16 w-16 mx-auto rounded-full border-2 border-yellow-900/50 shadow-lg grayscale opacity-80">
                    </div>

                    <div class="mb-8">
                        <div class="w-16 h-16 mx-auto bg-gray-800 rounded-2xl flex items-center justify-center border border-gray-700 shadow-xl">
                            <i class="fa-solid fa-pause text-3xl text-yellow-500"></i>
                        </div>
                    </div>
                    
                    <h2 class="text-2xl font-bold mb-3 text-white">System Paused</h2>
                    <p class="text-gray-400 text-base mb-8 leading-relaxed">
                        ${customMessage || 'Operations have been temporarily halted by administration for a scheduled review.'}
                    </p>
                    
                    <div class="flex justify-center gap-2 mb-8">
                        <span class="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                        <span class="h-1.5 w-1.5 rounded-full bg-yellow-500 opacity-50"></span>
                        <span class="h-1.5 w-1.5 rounded-full bg-yellow-500 opacity-25"></span>
                    </div>

                    ${contactSection}
                </div>
            `;
        } else {
            // Protocol 1: Maintenance (Standard)
            content = `
                <div class="font-sans text-gray-300 text-center p-8 md:p-12 max-w-lg w-full mx-4">
                    <div class="mb-8">
                        <img src="/images/logo.jpg" class="h-16 w-16 mx-auto rounded-full border-2 border-blue-900/50 shadow-lg grayscale opacity-80">
                    </div>

                    <div class="mb-8">
                         <div class="w-16 h-16 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                            <i class="fa-solid fa-screwdriver-wrench text-3xl text-blue-400"></i>
                        </div>
                    </div>
                    
                    <h2 class="text-2xl font-bold mb-3 text-white">Under Maintenance</h2>
                    <p class="text-gray-400 text-sm md:text-base mb-8 leading-relaxed max-w-sm mx-auto">
                        ${customMessage || 'We are currently updating this section to improve your experience. Please check back shortly.'}
                    </p>

                    <div class="w-full bg-gray-800/50 h-1.5 rounded-full overflow-hidden mb-8 max-w-xs mx-auto">
                        <div class="h-full bg-blue-500 w-2/3 rounded-full animate-[shimmer_2s_infinite] relative overflow-hidden">
                             <div class="absolute inset-0 bg-white/20 -skew-x-12 transform -translate-x-full animate-[shine_1.5s_infinite]"></div>
                        </div>
                    </div>
                    
                    ${contactSection}
                </div>
                <style>
                    @keyframes shine { 100% { transform: translateX(200%) skewX(-12deg); } }
                </style>
            `;
        }

        overlay.innerHTML = content;
        document.body.appendChild(overlay);

        // Add Click Handler for Contact Button
        const contactBtn = document.getElementById('owner-contact-btn');
        if (contactBtn) {
            contactBtn.addEventListener('click', () => {
                const toast = document.createElement('div');
                toast.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-red-900/50 text-gray-300 px-6 py-4 rounded-lg shadow-2xl z-[10000] flex items-center gap-4 min-w-[300px] animate-[systemGuardFadeIn_0.3s_ease-out]';
                toast.innerHTML = `
                    <div class="bg-red-900/20 p-2 rounded-full">
                        <i class="fa-solid fa-user-slash text-red-500"></i>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-white mb-0.5">Contact Unavailable</h4>
                        <p class="text-xs text-gray-400">Direct line to Adam Hawash is currently offline.</p>
                    </div>
                `;

                document.body.appendChild(toast);

                // Remove toast after 3 seconds
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => toast.remove(), 500);
                }, 3000);
            });
        }
    }

    // Add FadeIn Keyframe
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes systemGuardFadeIn {
            from { opacity: 0; transform: translate(-50%, -45%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
        }
    `;
    document.head.appendChild(styleSheet);
})();