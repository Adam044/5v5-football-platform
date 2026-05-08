/**
 * 5v5 Modern Sidebar Navigation
 * - Glassmorphism effect
 * - Responsive off-canvas drawer
 * - Organized categories
 * - Integrated user session management
 */
document.addEventListener('DOMContentLoaded', () => {
    const globalHeaderDiv = document.getElementById('global-header');

    if (globalHeaderDiv) {
        // Load System Guard
        const systemGuardScript = document.createElement('script');
        systemGuardScript.src = '/components/system-guard.js';
        document.body.appendChild(systemGuardScript);

        const loggedInUserId = localStorage.getItem('userId');
        const userName = localStorage.getItem('userName') || 'لاعب 5ع5';
        const is_admin = (localStorage.getItem('is_admin') === 'true' || localStorage.getItem('is_admin') === '1');

        // Inject Sidebar CSS
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --sidebar-width: 320px;
                --primary-gradient: linear-gradient(135deg, #10b981 0%, #059669 100%);
            }

            /* Top Bar */
            .top-navbar {
                height: 70px;
                background: rgba(255, 255, 255, 0.8);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 1.5rem;
                position: sticky;
                top: 0;
                z-index: 1000;
                transition: transform 0.3s ease;
            }

            /* Sidebar Drawer */
            #sidebar-nav {
                position: fixed;
                top: 0;
                right: calc(-1 * var(--sidebar-width));
                width: var(--sidebar-width);
                height: 100vh;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(20px);
                z-index: 10000;
                box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
                transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                flex-direction: column;
                overflow-y: auto;
            }

            #sidebar-nav.open {
                right: 0;
            }

            /* Overlay */
            #sidebar-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(4px);
                z-index: 9999;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }

            #sidebar-overlay.show {
                opacity: 1;
                visibility: visible;
            }

            /* Navigation Items */
            .nav-section-title {
                font-size: 0.75rem;
                font-weight: 800;
                text-transform: uppercase;
                color: #94a3b8;
                padding: 1.5rem 1.5rem 0.5rem;
                letter-spacing: 0.05em;
            }

            .nav-link {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.85rem 1.5rem;
                color: #475569;
                font-weight: 600;
                transition: all 0.2s ease;
                border-right: 4px solid transparent;
            }

            .nav-link:hover {
                background: rgba(16, 185, 129, 0.05);
                color: #10b981;
                border-right-color: #10b981;
            }

            .nav-link i {
                width: 20px;
                text-align: center;
                font-size: 1.1rem;
            }

            .nav-link.active {
                background: var(--primary-gradient);
                color: white !important;
                border-right-color: #047857;
            }

            .nav-link.active i {
                color: white;
            }

            /* Special Items */
            .fashion-link {
                color: #f97316;
            }
            .fashion-link:hover {
                background: rgba(249, 115, 22, 0.05);
                color: #ea580c;
                border-right-color: #f97316;
            }

            /* User Section in Sidebar */
            .sidebar-user-section {
                margin-top: auto;
                padding: 1.5rem;
                border-top: 1px solid #f1f5f9;
                background: #f8fafc;
            }

            .user-profile-badge {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.5rem;
                border-radius: 1rem;
            }

            .user-avatar {
                width: 40px;
                height: 40px;
                background: var(--primary-gradient);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 800;
                box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
            }

            .menu-toggle-btn {
                width: 45px;
                height: 45px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 12px;
                background: #f8fafc;
                color: #475569;
                transition: all 0.2s;
            }

            .menu-toggle-btn:hover {
                background: #f1f5f9;
                color: #10b981;
                transform: scale(1.05);
            }
        `;
        document.head.appendChild(style);

        const headerHTML = `
            <!-- Spain Camp Banner -->
            <div id="spain-camp-banner" class="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white py-2 px-4 text-center text-[10px] md:text-xs font-bold relative overflow-hidden group z-[1001]">
                <a href="/spain-camp" class="flex items-center justify-center gap-2">
                    <i class="fa-solid fa-earth-europe animate-pulse"></i>
                    <span>سجل الآن في معسكر إسبانيا للتدريب الاحترافي 2026! مقاعد محدودة</span>
                    <i class="fa-solid fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
                </a>
            </div>

            <!-- Top Navbar -->
            <div class="top-navbar">
                <!-- Menu Toggle (Right side in RTL) -->
                <button id="sidebar-open-btn" class="menu-toggle-btn shadow-sm border border-gray-100">
                    <i class="fa-solid fa-bars-staggered text-xl"></i>
                </button>
                
                <!-- Logo (Left side in RTL) -->
                <a href="/" class="flex items-center transform hover:scale-105 transition-transform">
                    <img src="/images/logo.jpg" alt="5ع5 Logo" class="h-10 w-auto rounded-full shadow-md border-2 border-white"/>
                </a>
            </div>

            <!-- Overlay -->
            <div id="sidebar-overlay"></div>

            <!-- Sidebar Nav -->
            <aside id="sidebar-nav">
                <div class="p-6 flex items-center justify-between border-b border-gray-50">
                    <div class="flex items-center gap-3">
                        <img src="/images/logo.jpg" alt="5v5" class="w-12 h-12 rounded-2xl shadow-lg"/>
                        <div>
                            <h2 class="font-black text-gray-900 leading-none">منصة 5ع5</h2>
                            <p class="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-widest">Football Hub 2026</p>
                        </div>
                    </div>
                    <button id="sidebar-close-btn" class="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div class="py-4">
                    <div class="nav-section-title">التنقل السريع</div>
                    <nav>
                        <a href="/" class="nav-link ${isActive('/') ? 'active' : ''}">
                            <i class="fa-solid fa-house"></i> الرئيسية
                        </a>
                        <a href="/fields" class="nav-link ${isActive('/fields') ? 'active' : ''}">
                            <i class="fa-solid fa-futbol"></i> قائمة الملاعب
                        </a>
                        <a href="/available-slots" class="nav-link ${isActive('/available-slots') ? 'active' : ''}">
                            <i class="fa-solid fa-calendar-days"></i> احجز ملعبك الآن
                        </a>
                        <a href="/tournaments" class="nav-link ${isActive('/tournaments') ? 'active' : ''}">
                            <i class="fa-solid fa-trophy"></i> البطولات الكبرى
                        </a>
                        <a href="/trainings" class="nav-link ${isActive('/trainings') ? 'active' : ''}">
                            <i class="fa-solid fa-futbol"></i> أكاديمية التدريب
                        </a>
                    </nav>

                    <div class="nav-section-title">عروض حصرية</div>
                    <nav>
                        <a href="/spain-camp" class="nav-link text-emerald-600 bg-emerald-50/30 ${isActive('/spain-camp') ? 'active' : ''}">
                            <i class="fa-solid fa-earth-europe"></i> معسكر إسبانيا 2026
                        </a>
                    </nav>

                    <div class="nav-section-title">التسوق والمجتمع</div>
                    <nav>
                        <a href="/fashion" class="nav-link fashion-link ${isActive('/fashion') ? 'active' : ''}">
                            <i class="fa-solid fa-shirt"></i> متجر 5v5 Fashion
                        </a>
                        <a href="/giveaways" class="nav-link ${isActive('/giveaways') ? 'active' : ''}">
                            <i class="fa-solid fa-gift"></i> مسابقات وجوائز
                        </a>
                        <a href="/gallery" class="nav-link ${isActive('/gallery') ? 'active' : ''}">
                            <i class="fa-solid fa-images"></i> معرض الصور
                        </a>
                    </nav>

                    <div class="nav-section-title">معلومات قانونية</div>
                    <nav>
                        <a href="/about" class="nav-link ${isActive('/about') ? 'active' : ''}">
                            <i class="fa-solid fa-circle-info"></i> عن المنصة
                        </a>
                        <a href="/terms-of-use" class="nav-link ${isActive('/terms-of-use') ? 'active' : ''}">
                            <i class="fa-solid fa-scroll"></i> شروط الاستخدام
                        </a>
                        <a href="/privacy-policy" class="nav-link ${isActive('/privacy-policy') ? 'active' : ''}">
                            <i class="fa-solid fa-user-lock"></i> سياسة الخصوصية
                        </a>
                    </nav>
                </div>

                ${loggedInUserId ? `
                    <div class="sidebar-user-section">
                        <div class="user-profile-badge mb-4">
                            <div class="user-avatar">${userName[0].toUpperCase()}</div>
                            <div class="overflow-hidden">
                                <p class="font-bold text-gray-900 truncate">${userName}</p>
                                <p class="text-[10px] text-green-600 font-bold uppercase tracking-wider">متصل الآن</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 gap-2">
                            <a href="${is_admin ? '/admin' : 'user-dashboard.html'}" class="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all">
                                <i class="fa-solid fa-gauge-high"></i> لوحة التحكم
                            </a>
                            <button onclick="handleLogout()" class="flex items-center justify-center gap-2 bg-red-50 text-red-600 py-2.5 rounded-xl font-bold text-sm hover:bg-red-100 transition-all">
                                <i class="fa-solid fa-right-from-bracket"></i> تسجيل الخروج
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="mt-auto p-6">
                        <a href="auth.html" class="flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white py-4 rounded-2xl font-black shadow-xl shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                            <i class="fa-solid fa-right-to-bracket"></i> انضم لـ 5ع5 الآن
                        </a>
                    </div>
                `}
            </aside>
        `;

        globalHeaderDiv.innerHTML = headerHTML;

        // Logic
        const sidebar = document.getElementById('sidebar-nav');
        const overlay = document.getElementById('sidebar-overlay');
        const openBtn = document.getElementById('sidebar-open-btn');
        const closeBtn = document.getElementById('sidebar-close-btn');

        function toggleSidebar(state) {
            if (state) {
                sidebar.classList.add('open');
                overlay.classList.add('show');
                document.body.style.overflow = 'hidden';
            } else {
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        }

        openBtn.addEventListener('click', () => toggleSidebar(true));
        closeBtn.addEventListener('click', () => toggleSidebar(false));
        overlay.addEventListener('click', () => toggleSidebar(false));

        function isActive(page) {
            const current = window.location.pathname.split('/').pop() || 'index.html';
            return current === page;
        }
    }
});

async function handleLogout() {
    function getCookieValue(name) {
        const match = document.cookie.match(new RegExp('(^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
        return match ? decodeURIComponent(match[2]) : '';
    }
    async function ensureCsrfToken() {
        try {
            const existing = getCookieValue('csrf_token');
            if (existing) return existing;
            const res = await fetch('/api/csrf-token', { credentials: 'include' });
            const data = await res.json().catch(() => ({}));
            return data.csrfToken || getCookieValue('csrf_token');
        } catch (e) { return getCookieValue('csrf_token'); }
    }

    try {
        const csrfToken = await ensureCsrfToken();
        await fetch('/api/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrfToken || '' } });
    } catch (e) {
        console.warn('Logout request failed:', e);
    }
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('is_admin');
    window.location.href = '/';
}
