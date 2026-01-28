(async function() {
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
        else if (path.includes('admin-dashboard.html')) pageId = 'admin-dashboard';

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
        overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-95 backdrop-blur-sm';
        
        let content = '';
        
        if (type === 'cyber') {
            overlay.style.backgroundColor = '#000';
            content = `
                <div class="font-mono text-green-500 text-center p-6 md:p-8 border-2 border-green-600 relative max-w-xl w-11/12 md:w-full mx-4 shadow-[0_0_50px_rgba(0,255,0,0.2)]">
                    <div class="absolute top-0 left-0 w-full h-1 bg-green-500 animate-pulse"></div>
                    <div class="absolute bottom-0 left-0 w-full h-1 bg-green-500 animate-pulse"></div>
                    
                    <div class="mb-6 flex justify-center">
                         <img src="/images/logo.jpg" class="h-16 w-16 md:h-20 md:w-20 rounded-full border-2 border-green-500 grayscale opacity-80 animate-pulse shadow-[0_0_15px_rgba(0,255,0,0.5)]">
                    </div>

                    <h1 class="text-4xl md:text-6xl font-bold mb-6 md:mb-8 tracking-tighter" style="text-shadow: 2px 2px 0px #003300;">BREACH DETECTED</h1>
                    
                    <div class="border-t border-b border-green-800 py-4 mb-6 md:mb-8 bg-green-900/10">
                        <p class="text-lg md:text-xl mb-2">SECURITY PROTOCOL: <span class="text-red-500 font-bold animate-pulse">ACTIVE</span></p>
                        <p class="text-xs tracking-widest opacity-70">REF: 77-21-AX-99 // SYSTEM ADMIN</p>
                    </div>
                    
                    <p class="text-base md:text-lg mb-8 text-green-400 font-bold">${customMessage || 'UNAUTHORIZED ACCESS ATTEMPT. CONNECTION TERMINATED.'}</p>
                    
                    <div class="border border-green-800 p-3 mb-6 bg-black">
                        <p class="text-xs text-green-600 uppercase mb-1">Platform Owner Contact</p>
                        <p class="text-sm md:text-base font-bold text-green-400">ADAM HAWASH</p>
                    </div>

                    <div class="grid grid-cols-2 gap-4 text-[10px] md:text-xs opacity-50 font-mono">
                        <div>ENCRYPTION: AES-256</div>
                        <div>STATUS: TERMINATED</div>
                    </div>
                </div>
            `;
        } else if (type === 'unavailable') {
             content = `
                <div class="font-mono bg-black text-green-500 p-8 md:p-12 border border-green-900 rounded-none shadow-2xl text-center max-w-lg w-11/12 md:w-full relative overflow-hidden mx-4">
                    <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgydjJIMUMxeiIgZmlsbD0iIzAwMzMwMCIgZmlsbC1ydWxlPSJldmVub2RkIi8+PC9zdmc+')] opacity-20"></div>
                    <div class="relative z-10">
                        <div class="mb-6 flex justify-center items-center gap-4">
                            <i class="fa-solid fa-microchip text-4xl md:text-5xl text-green-700 animate-pulse"></i>
                            <img src="/images/logo.jpg" class="h-12 w-12 rounded-full border border-green-800 opacity-70">
                        </div>
                        
                        <h2 class="text-2xl md:text-3xl font-bold mb-4 tracking-wider text-green-400">PROTOCOL OVERRIDE</h2>
                        <p class="text-green-300/90 text-base md:text-lg mb-8 leading-relaxed">${customMessage || 'Administrative Override in Progress. Stand by.'}</p>
                        
                        <div class="bg-green-900/20 p-4 border border-green-900/50 mb-6 backdrop-blur-sm">
                            <p class="text-xs text-green-600 mb-1 uppercase tracking-wider">Direct Communication Line</p>
                            <p class="text-lg font-bold text-green-400">Adam Hawash</p>
                            <p class="text-xs text-green-700 mt-1">Platform Owner</p>
                        </div>

                        <div class="border-t border-green-900 pt-4 mt-4 flex justify-between items-center text-xs text-green-800 font-mono">
                            <span>SYS.INTEGRITY: 98%</span>
                            <span>Authorized Personnel Only</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Standard / Page Locked (Signal Lost)
            content = `
                <div class="font-mono bg-black text-gray-300 p-8 md:p-10 border-l-4 border-gray-700 shadow-2xl text-center max-w-md w-11/12 md:w-full relative mx-4">
                    <div class="mb-8 flex flex-col items-center gap-4">
                        <img src="/images/logo.jpg" class="h-16 w-16 rounded-full grayscale opacity-50 border border-gray-800">
                        <div class="h-px w-20 bg-gray-800"></div>
                        <i class="fa-solid fa-signal text-4xl md:text-5xl text-gray-600"></i>
                    </div>
                    
                    <h2 class="text-xl md:text-2xl font-bold text-gray-100 mb-4 tracking-[0.2em] uppercase">Signal Lost</h2>
                    <p class="text-gray-500 mb-8 text-sm md:text-base">${customMessage || 'This frequency is currently silent.'}</p>
                    
                    <div class="bg-gray-900 p-4 rounded border border-gray-800 mb-6">
                        <p class="text-xs text-gray-600 mb-1">Platform Administrator</p>
                        <p class="text-sm font-bold text-gray-400">Adam Hawash</p>
                    </div>

                    <div class="text-[10px] text-gray-700 font-mono tracking-widest">
                        NO CARRIER DETECTED // END TRANSMISSION
                    </div>
                </div>
            `;
        }

        overlay.innerHTML = content;
        document.body.appendChild(overlay);
    }
})();