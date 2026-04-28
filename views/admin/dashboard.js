// --- Admin Access Check on page load ---
async function checkAdminAccess() {
    try {
        const meResp = await fetch('/api/me', { credentials: 'include' });
        if (!meResp.ok) {
            showMessageBox('غير مصرح', 'يجب تسجيل الدخول للوصول إلى هذه الصفحة.', 'error');
            setTimeout(() => window.location.href = '/auth', 1500);
            return;
        }
        const meData = await meResp.json();
        const user = meData.user;
        if (!user || !user.is_admin) {
            showMessageBox('غير مصرح', 'ليس لديك صلاحيات للوصول إلى لوحة تحكم الإدارة.', 'error');
            setTimeout(() => window.location.href = '/', 1500);
            return;
        }

        // Update admin name in all headers
        document.querySelectorAll('.admin-name-display').forEach(el => {
            el.textContent = user.name || 'الأدمن';
        });

        // Initial data fetch
        fetchData();

        // Set default active tab
        setActiveTab('overview-tab');
    } catch (error) {
        console.error('Admin access check failed:', error);
        showMessageBox('خطأ في الاتصال', `فشل التحقق من الصلاحيات. يرجى المحاولة لاحقاً.`, 'error');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
}

function switchTab(tabId, event, sectionId = null) {
    setActiveTab(tabId, event, sectionId);
}

// --- CSRF helpers and secure fetch ---
const nativeFetch = window.fetch.bind(window);
function getCookieValue(name) {
    const match = document.cookie.match(new RegExp('(^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : '';
}

async function ensureCsrfToken() {
    try {
        const existing = getCookieValue('csrf_token');
        if (existing) return existing;
        const res = await nativeFetch('/api/csrf-token', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        return data.csrfToken || getCookieValue('csrf_token');
    } catch (e) {
        return getCookieValue('csrf_token');
    }
}

async function secureFetch(url, options = {}) {
    const opts = { credentials: 'include', ...(options || {}) };
    const method = String(opts.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const csrfToken = await ensureCsrfToken();
        opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': csrfToken || '' };
    }
    return nativeFetch(url, opts);
}

// Override page fetch to enforce CSRF automatically on mutating admin calls
window.secureFetch = secureFetch;
window.fetch = secureFetch;

// --- Helper functions ---
function getStatusBadge(status) {
    const statusMap = {
        'pending': { text: 'قيد الانتظار', color: 'bg-yellow-200 text-yellow-800' },
        'matched': { text: 'تم التوفيق', color: 'bg-green-200 text-green-800' },
        'confirmed': { text: 'مؤكد', color: 'bg-green-200 text-green-800' },
        'completed': { text: 'مكتمل', color: 'bg-green-200 text-green-800' },
        'declined': { text: 'مرفوض', color: 'bg-red-200 text-red-800' },
        'upcoming': { text: 'قادمة', color: 'bg-blue-200 text-blue-800' },
        'past': { text: 'سابقة', color: 'bg-gray-200 text-gray-800' },
        'rejected': { text: 'مرفوض', color: 'bg-red-200 text-red-800' }
    };
    const badge = status && statusMap[status.toLowerCase()] ? statusMap[status.toLowerCase()] : { text: 'غير محدد', color: 'bg-gray-400 text-gray-800' };
    return `<span class="${badge.color} py-1 px-3 rounded-full text-xs font-semibold whitespace-nowrap">${badge.text}</span>`;
}

function getRequestType(type) {
    const typeMap = {
        'players_looking_for_team': 'لاعبون يبحثون عن فريق',
        'team_looking_for_players': 'فريق يبحث عن لاعبين',
        'team_vs_team': 'فريق ضد فريق',
    };
    return typeMap[type] || type;
}

function animateCounter(id, target, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;
    
    let current = 0;
    const duration = 1500;
    const step = target / (duration / 16);
    
    const update = () => {
        current += step;
        if (current >= target) {
            el.textContent = target + suffix;
        } else {
            el.textContent = Math.floor(current) + suffix;
            requestAnimationFrame(update);
        }
    };
    update();
}

function updateProgressBar(id, percentage) {
    const el = document.getElementById(id);
    if (!el) return;
    setTimeout(() => {
        el.style.width = percentage + '%';
    }, 100);
}

function showMessageBox(title, content, type = 'error', callback = null, isConfirmation = false) {
    const msgBox = document.getElementById('message-box');
    const msgTitle = document.getElementById('message-box-title');
    const msgContent = document.getElementById('message-box-content');
    const confirmButton = document.getElementById('message-box-confirm');
    const cancelButton = document.getElementById('message-box-cancel');

    if (!msgBox || !msgTitle || !msgContent || !confirmButton || !cancelButton) {
        console.error("MessageBox elements not found in the DOM.");
        return;
    }

    msgTitle.innerHTML = '';
    msgBox.className = 'hidden fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 animate-fade-in';
    msgBox.querySelector('.bg-white').className = 'bg-white rounded-2xl shadow-3xl p-8 w-full max-w-sm relative animate-scale-in-up text-center';

    if (type === 'error') {
        msgTitle.innerHTML = `<i class="fa-solid fa-octagon-xmark text-red-500 ml-2"></i>${title}`;
        msgBox.querySelector('.bg-white').classList.add('border-t-4', 'border-red-500');
        confirmButton.className = 'bg-red-600 text-white px-7 py-3 rounded-xl hover:bg-red-700 transition-all duration-300 shadow-md text-lg';
    } else if (type === 'success') {
        msgTitle.innerHTML = `<i class="fa-solid fa-circle-check text-green-600 ml-2"></i>${title}`;
        msgBox.querySelector('.bg-white').classList.add('border-t-4', 'border-green-600');
        confirmButton.className = 'bg-green-600 text-white px-7 py-3 rounded-xl hover:bg-green-700 transition-all duration-300 shadow-md text-lg';
    } else if (type === 'warning') {
        msgTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-500 ml-2"></i>${title}`;
        msgBox.querySelector('.bg-white').classList.add('border-t-4', 'border-yellow-500');
        confirmButton.className = 'bg-yellow-600 text-white px-7 py-3 rounded-xl hover:bg-yellow-700 transition-all duration-300 shadow-md text-lg';
    } else { // info
        msgTitle.innerHTML = `<i class="fa-solid fa-circle-info text-blue-500 ml-2"></i>${title}`;
        msgBox.querySelector('.bg-white').classList.add('border-t-4', 'border-blue-500');
        confirmButton.className = 'bg-blue-600 text-white px-7 py-3 rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-md text-lg';
    }
    msgContent.innerText = content;

    if (isConfirmation) {
        cancelButton.classList.remove('hidden');
        confirmButton.textContent = 'نعم';
        cancelButton.onclick = closeMessageBox;
    } else {
        cancelButton.classList.add('hidden');
        confirmButton.textContent = 'حسناً';
    }

    msgBox.classList.remove('hidden');

    if (callback) {
        confirmButton.onclick = () => {
            closeMessageBox();
            callback();
        };
    } else {
        confirmButton.onclick = closeMessageBox;
    }
}

function closeMessageBox() {
    document.getElementById('message-box').classList.add('hidden');
}

// --- Tab Management ---
const tabs = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');

function setActiveTab(tabId, event, sectionId = null) {
    const tabs = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Remove active classes from all buttons and hide all panes
    tabs.forEach(t => {
        t.classList.remove('active', 'bg-purple-100', 'bg-blue-100', 'bg-emerald-100', 'bg-green-100', 'bg-amber-100', 'bg-indigo-100', 'bg-rose-100', 'bg-pink-100', 'bg-orange-50', 'text-orange-600', 'bg-emerald-50', 'text-emerald-600', 'bg-blue-50', 'text-blue-600', 'bg-purple-50', 'text-purple-600');
    });
    tabPanes.forEach(p => p.classList.add('hidden'));

    // Find and activate the target button and pane
    let activeTabButton = event ? event.currentTarget : document.querySelector(`[data-tab="${tabId}"]`);
    const activeTabPane = document.getElementById(tabId);

    if (activeTabButton) {
        activeTabButton.classList.add('active');
        // Apply brand colors to active state
        if (tabId === 'overview-tab') activeTabButton.classList.add('bg-emerald-50', 'text-emerald-600');
        if (tabId === 'matchmaking-requests-tab') activeTabButton.classList.add('bg-blue-50', 'text-blue-600');
        if (tabId === 'reservations-tab') activeTabButton.classList.add('bg-emerald-50', 'text-emerald-600');
        if (tabId === 'availability-tab') activeTabButton.classList.add('bg-purple-50', 'text-purple-600');
        if (tabId === 'trainings-tab') activeTabButton.classList.add('bg-orange-50', 'text-orange-600');
    }
    
    if (activeTabPane) {
        activeTabPane.classList.remove('hidden');
        if (sectionId) {
            setTimeout(() => {
                const section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }

    // Close sidebar on mobile after selection
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('admin-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
    }

    // Refresh data based on selection
    switch (tabId) {
        case 'overview-tab': loadAnalytics(); break;
        case 'matchmaking-requests-tab': fetchData(); break;
        case 'reservations-tab': fetchData(); break;
        case 'availability-tab':
            fetchData();
            loadBatchFields();
            break;
        case 'trainings-tab': fetchTrainingData(); break;
        case 'fields-tab': fetchData(); break;
        case 'tournaments-tab': fetchTournaments(); break;
        case 'players-tab': fetchPlayers(); break;
        case 'fashion-tab': fetchFashionProducts(); break;
        case 'giveaways-tab': fetchAdminGiveaways(); break;
    }
}

// --- Skeleton helpers ---
function insertSkeletonTableBody(tbodyId, rows = 5, cols = 6) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rowsHtml = Array.from({ length: rows }).map(() => {
        const tds = Array.from({ length: cols })
            .map(() => `<td class="px-4 py-3"><div class="skeleton skeleton-line h-4 w-24"></div></td>`)
            .join('');
        return `<tr class="border-b border-gray-200">${tds}</tr>`;
    }).join('');
    tbody.innerHTML = rowsHtml;
}

function insertSkeletonCards(containerId, count = 6) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = Array.from({ length: count }).map(() => `
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div class="skeleton skeleton-block h-40 w-full mb-4"></div>
                    <div class="skeleton skeleton-line h-5 w-2/3 mb-2"></div>
                    <div class="skeleton skeleton-line h-4 w-1/2"></div>
                </div>
            `).join('');
}

function insertSkeletonTable(containerId, rows = 5, cols = 5) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const bodyRows = Array.from({ length: rows }).map(() => {
        const tds = Array.from({ length: cols })
            .map(() => `<td class="px-4 py-3"><div class="skeleton skeleton-line h-4 w-24"></div></td>`)
            .join('');
        return `<tr>${tds}</tr>`;
    }).join('');
    container.innerHTML = `
                <table class="w-full table-auto border-collapse">
                    <tbody>${bodyRows}</tbody>
                </table>
            `;
}

// --- Fetch and Render Data ---
async function fetchData() {
    try {
        // Show global loader
        if (window.GlobalLoader) window.GlobalLoader.show();

        // Show skeletons while data loads
        insertSkeletonTableBody('reservations-table-body', 6, 7);
        insertSkeletonCards('fields-card-container', 6);
        insertSkeletonCards('availability-slots-container', 6);
        insertSkeletonCards('tournaments-list', 6);
        ['teams-looking-requests', 'team-vs-team-requests', 'players-looking-requests', 'done-requests']
            .forEach(id => insertSkeletonTable(id, 5, 5));

        // Fetch fields and populate dropdowns
        try {
            const fieldsResponse = await fetch('/api/admin/fields', { credentials: 'include' });
            if (fieldsResponse.ok) {
                const fieldsData = await fieldsResponse.json();
                window.adminFields = Array.isArray(fieldsData.fields) ? fieldsData.fields : [];
                renderFields(window.adminFields);
                populateFieldDropdowns(window.adminFields);
            }
        } catch (e) { console.error('Fields fetch failed', e); }

        // Fetch all data for the tabs with individual error grace
        const fetchJSON = (url) => fetch(url, { credentials: 'include' })
            .then(res => res.ok ? res.json() : (console.error(`Fetch failed for ${url}: ${res.status}`), {}));

        const [reservationsData, categorizedMatchmakingData, tournamentsData] = await Promise.all([
            fetchJSON('/api/admin/reservations'),
            fetchJSON('/api/admin/matchmaking/categorized'),
            fetchJSON('/api/admin/tournaments'),
        ]);

        if (reservationsData && reservationsData.reservations) {
            window.allReservations = reservationsData.reservations;
            renderReservations(window.allReservations);
        }
        if (categorizedMatchmakingData) renderMatchmakingCategorized(categorizedMatchmakingData);
        if (tournamentsData && tournamentsData.tournaments) renderTournamentsList(tournamentsData.tournaments);
        loadAnalytics();
        loadAvailabilitySlots();

    } catch (error) {
        console.error('Failed to fetch data:', error);
        showMessageBox('خطأ في الاتصال', `فشل تحميل البيانات. يرجى التأكد من تشغيل الخادم. تفاصيل الخطأ: ${error.message}`, 'error');
    } finally {
        // Hide global loader
        if (window.GlobalLoader) window.GlobalLoader.hide();
    }
}

// --- NEW MATCHMAKING RENDER FUNCTION ---
function renderMatchmakingCategorized(data) {
    const pendingTotal =
        data.team_looking_for_players.filter(r => r.status === 'pending').length +
        data.team_vs_team.filter(r => r.status === 'pending').length +
        data.players_looking_for_team.filter(r => r.status === 'pending').length;

    // Update stats
    const pendingStat = document.getElementById('stat-pending-requests');
    if (pendingStat) pendingStat.textContent = pendingTotal;

    const potentialStat = document.getElementById('stat-potential-matches');
    if (potentialStat) potentialStat.textContent = data.potential_matches.length;

    // Render Teams Looking for Players (needs players)
    renderMatchmakingTable(
        document.getElementById('teams-looking-requests'),
        data.team_looking_for_players.filter(r => r.status === 'pending'),
        'team'
    );

    // Render Team vs Team requests separately
    renderMatchmakingTable(
        document.getElementById('team-vs-team-requests'),
        data.team_vs_team.filter(r => r.status === 'pending'),
        'team'
    );

    // Render Players Looking for Team (Single Player)
    renderMatchmakingTable(
        document.getElementById('players-looking-requests'),
        data.players_looking_for_team.filter(r => r.status === 'pending'),
        'player'
    );

    // Render Potential Matches
    renderPotentialMatches(data.potential_matches);

    // Render Done Requests (all categories)
    renderDoneRequestsSection(document.getElementById('done-requests'), data);

    const toggle = document.getElementById('toggle-done-requests');
    if (toggle) {
        toggle.onchange = () => {
            const section = document.getElementById('done-requests');
            if (!section) return;
            if (toggle.checked) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        };
    }
}

function renderDoneRequestsSection(container, data) {
    const allDone = [
        ...data.team_looking_for_players,
        ...data.team_vs_team,
        ...data.players_looking_for_team
    ].filter(r => r.status === 'done');

    if (!container) return;
    container.innerHTML = '';

    if (allDone.length === 0) {
        container.innerHTML = `<p class="py-4 text-center text-slate-400 text-[10px] font-bold">لا توجد طلبات منجزة</p>`;
        return;
    }

    container.innerHTML = allDone.map(request => `
        <div class="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group">
            <div class="min-w-0">
                <div class="text-[11px] font-black text-slate-800 truncate">${request.user_name}</div>
                <div class="text-[9px] font-bold text-slate-400 capitalize">${getReservationType(request.request_type)}</div>
            </div>
            <button class="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100" 
                    onclick="openDetailsModal(${request.id}, '${request.user_name}', '${request.phone_number || ''}', '${request.field_name}', '${request.slot_date}', '${request.request_type}', ${request.players_needed || 0})">
                <i class="fa-solid fa-eye text-[10px]"></i>
            </button>
        </div>
    `).join('');
}

function renderMatchmakingTable(container, requests, category) {
    if (!container) return;
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = `<div class="col-span-full py-16 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
            <i class="fa-solid fa-inbox text-slate-300 text-4xl mb-3"></i>
            <p class="text-slate-400 font-medium">لا توجد طلبات معلقة</p>
        </div>`;
        return;
    }

    container.innerHTML = requests.map(request => {
        const typeLabel = getReservationType(request.request_type);
        const contactHref = request.phone_number ? `https://wa.me/${request.phone_number.replace(/\D/g, '')}` : '#';

        return `
            <div class="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all p-5 group">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                            <i class="fa-solid fa-user"></i>
                        </div>
                        <div>
                            <h6 class="font-black text-slate-800 tracking-tight">${request.user_name}</h6>
                            <span class="text-[10px] font-black uppercase text-blue-500 tracking-widest">${typeLabel}</span>
                        </div>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="markRequestDone(${request.id})" class="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-all shadow-sm" title="تم">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button onclick="rejectMatchmakingRequest(${request.id})" class="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm" title="رفض">
                            <i class="fa-solid fa-times"></i>
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-5">
                    <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                        <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">الموعد</div>
                        <div class="text-[11px] font-black text-slate-700 flex items-center gap-2">
                             <i class="fa-solid fa-calendar text-blue-400"></i> ${request.slot_date}
                        </div>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                        <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">المكان</div>
                        <div class="text-[11px] font-black text-slate-700 truncate flex items-center gap-2">
                             <i class="fa-solid fa-location-dot text-amber-400"></i> ${request.field_name}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <a href="${contactHref}" target="_blank" class="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-black py-2.5 rounded-xl hover:bg-green-600 transition-all text-[11px] shadow-lg shadow-green-100">
                        <i class="fa-brands fa-whatsapp text-sm"></i> تواصل
                    </a>
                    <button onclick="openDetailsModal(${request.id}, '${request.user_name}', '${request.phone_number || ''}', '${request.field_name}', '${request.slot_date}', '${request.request_type}', ${request.players_needed || 0})" 
                            class="flex-1 bg-slate-100 text-slate-600 font-black py-2.5 rounded-xl hover:bg-slate-200 transition-all text-[11px]">
                        تفاصيل
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Details Modal: fetch leader and joined members
async function openDetailsModal(requestId, userName, phoneNumber, fieldName, slotDate, requestType, playersNeeded) {
    const modal = document.getElementById('details-modal');
    const bodyContainer = modal.querySelector('.space-y-3');

    // Basic info section
    const basicInfoHtml = `
                <p><strong>الاسم:</strong> <span>${userName || 'غير متوفر'}</span></p>
                <p><strong>رقم الهاتف:</strong> ${phoneNumber ? `<a href="https://wa.me/${(phoneNumber || '').replace(/\D/g, '')}" target="_blank" class="text-green-600 font-bold hover:underline flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i>${phoneNumber}</a>` : '<span>غير متوفر</span>'}</p>
                <p><strong>الملعب:</strong> <span>${fieldName || '-'}</span></p>
                <p><strong>التاريخ:</strong> <span>${slotDate || '-'}</span></p>
                <p><strong>نوع الطلب:</strong> <span>${getReservationType(requestType)}</span></p>
                ${requestType === 'players_looking_for_team' ? '' : `<p><strong>عدد اللاعبين المطلوب:</strong> <span>${playersNeeded || 0}</span></p>`}
            `;

    bodyContainer.innerHTML = basicInfoHtml + '<div id="details-members-section" class="mt-4"></div>';

    // Fetch extended details
    try {
        const resp = await fetch(`/api/admin/matchmaking-requests/${requestId}/details`, {
            credentials: 'include'
        });
        if (!resp.ok) throw new Error('Failed to load details');
        const data = await resp.json();

        const leader = data.leader || {};
        let members = Array.isArray(data.members) ? data.members : [];

        // Deduplicate leader from members if present
        members = members.filter(m => String(m.user_id) !== String(leader.user_id));

        const membersSection = document.getElementById('details-members-section');
        const leaderPhone = leader.phone_number || null;
        const leaderRow = `
                    <div class="bg-gray-50 rounded-lg p-3 border mb-2">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="font-medium text-gray-800"><i class="fa-solid fa-user-tie ml-1 text-blue-600"></i> القائد: ${leader.name || userName || 'غير متوفر'}</p>
                                ${leaderPhone ? `<p class="text-sm text-gray-600 flex items-center gap-1"><i class="fa-solid fa-phone ml-1 text-blue-500"></i><a href="https://wa.me/${leaderPhone.replace(/\D/g, '')}" target="_blank" class="text-green-600 font-bold hover:underline"><i class="fa-brands fa-whatsapp"></i> ${leaderPhone}</a></p>` : ''}
                            </div>
                            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">القائد</span>
                        </div>
                    </div>
                `;

        // For single player request, show a simplified panel and skip leader/members headings
        if (requestType === 'players_looking_for_team') {
            membersSection.innerHTML = `
                        <div class="bg-blue-50 rounded-lg p-4 border">
                            <p class="font-medium text-gray-800 flex items-center gap-2"><i class="fa-solid fa-user text-blue-600"></i> لاعب يبحث عن فريق</p>
                            <p class="text-gray-700">${userName || leader.name || 'غير متوفر'}</p>
                            ${phoneNumber || leader.phone_number ? `<p class="text-sm text-gray-600 flex items-center gap-1"><i class="fa-solid fa-phone ml-1 text-blue-500"></i><a href="https://wa.me/${(phoneNumber || leader.phone_number || '').replace(/\D/g, '')}" target="_blank" class="text-green-600 font-bold hover:underline"><i class="fa-brands fa-whatsapp"></i> ${phoneNumber || leader.phone_number}</a></p>` : ''}
                        </div>
                    `;
        } else {
            const membersHtml = members.length > 0 ? members.map(m => `
                    <div class="bg-gray-50 rounded-lg p-3 border">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="font-medium text-gray-800">${m.name || 'لا اسم'}</p>
                                ${m.phone_number ? `<p class="text-sm text-gray-600 flex items-center gap-1"><i class="fa-solid fa-phone ml-1 text-blue-500"></i><a href="https://wa.me/${m.phone_number.replace(/\D/g, '')}" target="_blank" class="text-green-600 font-bold hover:underline"><i class="fa-brands fa-whatsapp"></i> ${m.phone_number}</a></p>` : ''}
                            </div>
                            ${m.team_designation ? `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">${m.team_designation === 'single' ? '' : `فريق ${m.team_designation}`}</span>` : ''}
                        </div>
                    </div>
                `).join('') : '<p class="text-gray-500">لا يوجد أعضاء منضمين بعد.</p>';

            membersSection.innerHTML = `
                        <h4 class="font-bold text-gray-700 mb-2 flex items-center gap-2"><i class="fa-solid fa-users text-blue-600"></i> القائد والأعضاء</h4>
                        ${leaderRow}
                        <div class="grid grid-cols-1 gap-2">${membersHtml}</div>
                    `;
        }
    } catch (err) {
        console.error('Failed to fetch details:', err);
        // Leave basic info; show error for members
        const membersSection = document.getElementById('details-members-section');
        if (membersSection) {
            membersSection.innerHTML = '<p class="text-red-600">تعذر تحميل تفاصيل الأعضاء.</p>';
        }
    }

    modal.classList.remove('hidden');
}

function closeDetailsModal() {
    document.getElementById('details-modal').classList.add('hidden');
}

async function markRequestDone(requestId) {
    try {
        const response = await fetch(`/api/admin/matchmaking-requests/${requestId}/done`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({})
        });
        if (response.ok) {
            showMessageBox('تمت المعالجة', 'تم وضع الطلب كمنجز وإخفاؤه من المعلّق.', 'success');
            fetchData();
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ', errorData.error);
        }
    } catch (error) {
        console.error('Failed to mark request done:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}

function renderPotentialMatches(suggestions) {
    const container = document.getElementById('potential-matches-suggestions');
    if (!container) return;
    container.innerHTML = '';

    if (suggestions.length === 0) {
        container.innerHTML = `<div class="py-12 text-center">
            <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                <i class="fa-solid fa-magnifying-glass text-2xl"></i>
            </div>
            <p class="text-slate-400 text-xs font-bold">لا توجد مطابقات مقترحة حالياً</p>
        </div>`;
        return;
    }

    suggestions.forEach(match => {
        const team = match.teamRequest;
        const player = match.playerRequest;

        const card = document.createElement('div');
        card.className = 'bg-slate-50/50 rounded-3xl p-5 border border-slate-100 hover:border-green-200 hover:bg-green-50/30 transition-all';
        card.innerHTML = `
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/50">
                <div class="text-[10px] font-black text-slate-400 flex items-center gap-2">
                    <i class="fa-solid fa-calendar"></i> ${team.slot_date}
                </div>
                <div class="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full uppercase">تطابق عالي</div>
            </div>
            
            <div class="space-y-4">
                <!-- Team -->
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xs">
                        <i class="fa-solid fa-users"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="text-[11px] font-black text-slate-800 truncate">${team.user_name}</div>
                        <div class="text-[9px] font-bold text-slate-400">فريق (ناقص ${team.players_needed})</div>
                    </div>
                </div>

                <div class="flex items-center justify-center">
                    <div class="w-px h-4 bg-slate-200"></div>
                </div>

                <!-- Player -->
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-xs">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="text-[11px] font-black text-slate-800 truncate">${player.user_name}</div>
                        <div class="text-[9px] font-bold text-slate-400">لاعب فردي</div>
                    </div>
                </div>
            </div>

            <button onclick="showMessageBox('تنبيه للمطابقة', 'هذه المقترحات تتطلب اتصالاً يدوياً بين الإدارة والمستخدمين للتوفيق بين الفريق واللاعب الفردي. يمكنك استخدام أرقام الهواتف المتوفرة.', 'info')" 
                class="w-full mt-6 bg-white border border-slate-200 text-slate-600 font-black py-2.5 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all text-[10px] shadow-sm">
                <i class="fa-solid fa-phone-volume mr-1"></i> إتمام التوفيق
            </button>
        `;
        container.appendChild(card);
    });
}

// --- EXISTING RENDER FUNCTIONS (Kept for completeness) ---
function renderFields(fields) {
    const container = document.getElementById('fields-card-container');
    container.innerHTML = '';

    if (!Array.isArray(fields) || fields.length === 0) {
        container.innerHTML = `<p class="py-4 text-center text-gray-500">لا توجد ملاعب لعرضها.</p>`;
        return;
    }
    fields.forEach(field => {
        const card = document.createElement('div');
        card.className = 'info-card';
        const imageUrl = field.image_url || `https://placehold.co/600x400/22c55e/ffffff?text=${field.name.replace(/\s/g, '+')}`;
        card.innerHTML = `
                    <div class="info-card-header">
                        <div class="info-card-title">
                            <i class="fa-solid fa-futbol text-green-600"></i> ${field.name}
                        </div>
                        <button onclick="deleteField(${field.id})" class="text-red-500 hover:text-red-700 transition-colors duration-300">
                           <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <img src="${imageUrl}" alt="${field.name}" class="w-full h-48 object-cover rounded-xl mb-4" onerror="this.onerror=null;this.src='https://placehold.co/600x400/22c55e/ffffff?text=${field.name.replace(/\s/g, '+')}'"/>
                    <div class="info-card-body">
                        <p class="mb-2"><strong>الموقع:</strong> ${field.location}</p>
                        <p class="mb-4"><strong>الوصف:</strong> ${field.description || '-'}</p>
                        <p class="text-xl font-bold text-gray-900">
                            ${field.price_per_hour} شيكل / ساعة
                        </p>
                    </div>
                    <div class="info-card-footer">
                        <button onclick="openEditFieldModal(${field.id})" class="info-card-button bg-blue-500 text-white hover:bg-blue-600">
                            <i class="fa-solid fa-edit ml-2"></i> تعديل
                        </button>
                    </div>
                `;
        container.appendChild(card);
    });
}

// Helper: map reservation type to Arabic label
function getReservationType(type) {
    switch (type) {
        case 'full_field':
            return 'حجز ملعب كامل';
        case 'two_teams_ready':
            return 'مباراة بين فريقين جاهزين';
        case 'team_looking_for_players':
            return 'فريق يبحث عن لاعبين';
        case 'team_vs_team':
            return 'فريق ضد فريق';
        case 'players_looking_for_team':
            return 'لاعب يبحث عن فريق';
        case null:
        case undefined:
        case '':
            return 'غير محدد';
        default:
            return 'غير معروف';
    }
}

let resStatusFilter = 'all';

function setResStatusFilter(status) {
    resStatusFilter = status;

    // Update button styling
    document.querySelectorAll('.res-status-btn').forEach(btn => {
        btn.classList.remove('bg-green-600', 'text-white');
        btn.classList.add('text-slate-400', 'hover:bg-slate-50');
    });

    const activeBtn = document.getElementById(`res-status-${status}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-400', 'hover:bg-slate-50');
        activeBtn.classList.add('bg-green-600', 'text-white');
    }

    filterReservations();
}

function filterReservations() {
    if (!window.allReservations) return;

    const searchText = document.getElementById('res-filter-search')?.value.toLowerCase() || '';
    const fieldId = document.getElementById('res-filter-field')?.value || '';
    const dateVal = document.getElementById('res-filter-date')?.value || '';

    const filtered = window.allReservations.filter(res => {
        const matchSearch = !searchText || (res.user_name || '').toLowerCase().includes(searchText);
        const matchField = !fieldId || String(res.field_id) === fieldId;
        const matchDate = !dateVal || res.slot_date === dateVal;

        let matchStatus = true;
        // Since API currently returns only active reservations, status filter for 'cancelled' will be empty
        if (resStatusFilter === 'confirmed') matchStatus = true;
        else if (resStatusFilter === 'cancelled') matchStatus = false;

        return matchSearch && matchField && matchDate && matchStatus;
    });

    renderReservations(filtered);
}

function renderReservations(reservations) {
    const tbody = document.getElementById('reservations-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!Array.isArray(reservations) || reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-20 bg-slate-50/30 text-slate-400 font-bold uppercase tracking-widest text-[10px]">لا توجد حجوزات تطابق الفلتر</td></tr>';
        return;
    }

    reservations.forEach(reservation => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/50 transition-colors group';

        const isConfirmed = true; // Everything in /api/admin/reservations table is an active booking
        const statusText = 'مؤكد';
        const statusClass = 'bg-green-50 text-green-600 border-green-100';

        const typeLabel = getReservationType(reservation.booking_type);
        const contactHref = reservation.phone_number ? `https://wa.me/${reservation.phone_number.replace(/\D/g, '')}` : null;

        row.innerHTML = `
            <td class="px-8 py-5">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-white transition-colors">
                        <i class="fa-solid fa-user text-xs"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="text-sm font-black text-slate-800 truncate">${reservation.user_name || 'ضيف'}</div>
                        ${contactHref ? `<a href="${contactHref}" target="_blank" class="text-[10px] font-bold text-green-500 hover:underline flex items-center gap-1"><i class="fa-brands fa-whatsapp text-xs"></i> واتساب</a>` : '<span class="text-[10px] text-slate-400">لا يوجد رقم</span>'}
                    </div>
                </div>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-location-dot text-amber-400 text-xs"></i>
                    <span class="text-xs font-black text-slate-700">${reservation.field_name}</span>
                </div>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-calendar text-blue-400 text-xs"></i>
                    <span class="text-xs font-black text-slate-700">${reservation.slot_date}</span>
                </div>
            </td>
            <td class="px-8 py-5">
                <span class="text-xs font-black text-slate-600 tabular-nums">${reservation.start_time} - ${reservation.end_time}</span>
            </td>
            <td class="px-8 py-5">
                <span class="px-3 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded-lg uppercase tracking-tight">${typeLabel}</span>
            </td>
            <td class="px-8 py-5 text-center">
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 ${statusClass} border rounded-full text-[10px] font-black shadow-sm">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    ${statusText}
                </span>
            </td>
            <td class="px-8 py-5">
                <div class="flex justify-center gap-2">
                    <button onclick="cancelReservation(${reservation.id})" 
                        class="p-2 rounded-xl bg-red-50 text-red-400 hover:bg-red-600 hover:text-white transition-all shadow-sm group/btn border border-red-100" title="إلغاء الحجز">
                        <i class="fa-solid fa-calendar-xmark text-xs"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}



// --- MODAL AND ACTION FUNCTIONS (Kept for completeness) ---

function openAddFieldModal() {
    document.getElementById('add-field-modal').classList.remove('hidden');
}

function closeAddFieldModal() {
    document.getElementById('add-field-modal').classList.add('hidden');
    document.getElementById('add-field-form').reset();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function handleAddField() {
    const name = document.getElementById('field-name').value;
    const description = document.getElementById('field-description').value;
    const location = document.getElementById('field-location').value;
    const pricePerHour = document.getElementById('field-price').value;
    const imageFile = document.getElementById('field-image-file').files[0];

    if (!imageFile) {
        showMessageBox('خطأ في الصورة', 'يرجى اختيار صورة للملعب.', 'error');
        return;
    }

    try {
        const imageData = await fileToBase64(imageFile);

        const response = await fetch('/api/admin/fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description, location, pricePerHour, image: imageData })
        });

        if (response.ok) {
            closeAddFieldModal();
            fetchData();
            showMessageBox('تمت الإضافة بنجاح', 'تم إضافة الملعب الجديد.', 'success');
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ في الإضافة', errorData.error);
        }
    } catch (error) {
        console.error('Failed to add field:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}

async function openEditFieldModal(fieldId) {
    try {
        console.debug('openEditFieldModal: fieldId =', fieldId);
        const response = await fetch(`/api/fields/${fieldId}`);
        if (!response.ok) {
            console.warn('Fetch field by id failed with status:', response.status);
            // Fallback to last loaded admin fields
            const fallback = (window.adminFields || []).find(f => String(f.id) === String(fieldId));
            if (!fallback) throw new Error('Failed to fetch field data');
            document.getElementById('edit-field-id').value = fieldId;
            document.getElementById('edit-field-name').value = fallback.name || '';
            document.getElementById('edit-field-description').value = fallback.description || '';
            document.getElementById('edit-field-location').value = fallback.location || '';
            document.getElementById('edit-field-price').value = fallback.price_per_hour || '';
            const imagePreview = document.getElementById('edit-field-image-preview');
            imagePreview.src = fallback.image_url || `https://placehold.co/600x400/22c55e/ffffff?text=${(fallback.name || '').replace(/\s/g, '+')}`;
            document.getElementById('edit-field-modal').classList.remove('hidden');
            return;
        }
        const field = await response.json();

        document.getElementById('edit-field-id').value = fieldId;
        document.getElementById('edit-field-name').value = field.field.name;
        document.getElementById('edit-field-description').value = field.field.description;
        document.getElementById('edit-field-location').value = field.field.location;
        document.getElementById('edit-field-price').value = field.field.price_per_hour;

        const imagePreview = document.getElementById('edit-field-image-preview');
        imagePreview.src = field.field.image_url || `https://placehold.co/600x400/22c55e/ffffff?text=${field.field.name.replace(/\s/g, '+')}`;

        document.getElementById('edit-field-modal').classList.remove('hidden');
    } catch (error) {
        console.error('Failed to open edit modal:', error);
        showMessageBox('خطأ', 'فشل تحميل بيانات الملعب للتعديل.', 'error');
    }
}

function closeEditFieldModal() {
    document.getElementById('edit-field-modal').classList.add('hidden');
}

async function handleEditField() {
    const fieldId = document.getElementById('edit-field-id').value;
    const name = document.getElementById('edit-field-name').value;
    const description = document.getElementById('edit-field-description').value;
    const location = document.getElementById('edit-field-location').value;
    const pricePerHour = document.getElementById('edit-field-price').value;
    const imageFile = document.getElementById('edit-field-image-file').files[0];

    const body = { name, description, location, pricePerHour };
    if (imageFile) {
        body.image = await fileToBase64(imageFile);
    }

    try {
        const response = await fetch(`/api/admin/fields/${fieldId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });

        if (response.ok) {
            closeEditFieldModal();
            fetchData();
            showMessageBox('تم التحديث بنجاح', 'تم تعديل بيانات الملعب.', 'success');
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ في التعديل', errorData.error);
        }
    } catch (error) {
        console.error('Failed to edit field:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}

async function deleteField(fieldId) {
    showMessageBox(
        'تأكيد الحذف',
        'هل أنت متأكد من رغبتك في حذف هذا الملعب؟',
        'warning',
        async () => {
            try {
                const response = await fetch(`/api/admin/fields/${fieldId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                if (response.ok) {
                    fetchData();
                    showMessageBox('تم الحذف', 'تم حذف الملعب بنجاح.', 'success');
                } else {
                    const errorData = await response.json();
                    showMessageBox('خطأ في الحذف', errorData.error);
                }
            } catch (error) {
                console.error('Failed to delete field:', error);
                showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
            }
        },
        true
    );
}

function openAddSlotModal(fieldId, fieldName) {
    document.getElementById('slot-field-id').value = fieldId;
    document.getElementById('slot-field-name').innerText = fieldName;
    document.getElementById('add-slot-modal').classList.remove('hidden');
    addSlotInput();
    fetchAvailabilityForAdmin(fieldId);
}

function closeAddSlotModal() {
    document.getElementById('add-slot-modal').classList.add('hidden');
    document.getElementById('add-slot-form').reset();
    document.getElementById('slots-container').innerHTML = '';
    document.getElementById('availability-view').innerHTML = '';
}

async function fetchAvailabilityForAdmin(fieldId) {
    const date = document.getElementById('slot-date').value;
    const viewContainer = document.getElementById('availability-view');
    viewContainer.innerHTML = `<p class="text-center text-gray-500">جاري تحميل المواعيد...</p>`;

    try {
        let url = `/api/admin/availability?`;
        const params = new URLSearchParams();

        if (fieldId) params.append('fieldId', fieldId);
        if (date) params.append('date', date);

        url += params.toString();

        const response = await fetch(url, {
            credentials: 'include'
        });
        const data = await response.json();

        viewContainer.innerHTML = '';
        if (data.availability && data.availability.length > 0) {
            const groupedByDate = {};
            data.availability.forEach(slot => {
                if (!groupedByDate[slot.slot_date]) {
                    groupedByDate[slot.slot_date] = [];
                }
                groupedByDate[slot.slot_date].push(slot);
            });

            Object.keys(groupedByDate).sort().forEach(slotDate => {
                if (!date && Object.keys(groupedByDate).length > 1) {
                    const dateHeader = document.createElement('div');
                    dateHeader.className = 'text-lg font-bold text-gray-700 mt-4 mb-2 border-b pb-1';
                    dateHeader.textContent = slotDate;
                    viewContainer.appendChild(dateHeader);
                }

                groupedByDate[slotDate].forEach(slot => {
                    const slotDiv = document.createElement('div');
                    const statusClass = slot.is_reserved === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                    const statusText = slot.is_reserved === 0 ? 'متاح' : `محجوز (${slot.user_name || 'غير معروف'})`;
                    slotDiv.className = `flex items-center justify-between p-3 rounded-lg ${statusClass} font-semibold mb-2`;
                    slotDiv.innerHTML = `
                                <span>${slot.start_time} - ${slot.end_time}</span>
                                <span>${statusText}</span>
                            `;
                    viewContainer.appendChild(slotDiv);
                });
            });
        } else {
            const message = date ? 'لا توجد مواعيد مضافة لهذا اليوم.' : 'لا توجد مواعيد مضافة لهذا الملعب.';
            viewContainer.innerHTML = `<p class="text-center text-gray-500">${message}</p>`;
        }
    } catch (error) {
        console.error('Failed to fetch availability for admin:', error);
        viewContainer.innerHTML = `<p class="text-center text-red-500">حدث خطأ في تحميل المواعيد.</p>`;
    }
}

function addSlotInput() {
    const slotsContainer = document.getElementById('slots-container');
    const newSlotDiv = document.createElement('div');
    newSlotDiv.className = 'flex items-center gap-2';
    newSlotDiv.innerHTML = `
                <input type="time" name="start_time" class="p-2 border border-gray-300 rounded-lg w-1/2 text-right" required>
                <span class="text-gray-500">-</span>
                <input type="time" name="end_time" class="p-2 border border-gray-300 rounded-lg w-1/2 text-right" required>
                <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
    slotsContainer.appendChild(newSlotDiv);
}

function initDashboardEvents() {
    const slotDate = document.getElementById('slot-date');
    if (slotDate) {
        slotDate.addEventListener('change', (e) => {
            const fieldId = document.getElementById('slot-field-id').value;
            if (fieldId) {
                fetchAvailabilityForAdmin(fieldId);
            }
        });
    }

    const availField = document.getElementById('availability-field-select');
    const availDate = document.getElementById('availability-date-select');
    if (availField) availField.addEventListener('change', loadAvailabilitySlots);
    if (availDate) availDate.addEventListener('change', loadAvailabilitySlots);

    const cancelBtn = document.getElementById('edit-giveaway-cancel');
    const saveBtn = document.getElementById('edit-giveaway-save');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditGiveawayModal);
    if (saveBtn) saveBtn.addEventListener('click', saveGiveawayEdit);

    const tourneyField = document.getElementById('tournament-field');
    if (tourneyField) {
        tourneyField.addEventListener('change', async (e) => {
            const fieldId = e.target.value;
            const imagePreview = document.getElementById('tournament-image-preview');
            const imageInput = document.getElementById('tournament-image');

            if (fieldId) {
                try {
                    const response = await fetch(`/api/fields/${fieldId}`);
                    if (!response.ok) throw new Error('Failed to fetch field data');
                    const field = await response.json();
                    if (field.field.image_url) {
                        imagePreview.src = field.field.image_url;
                        imagePreview.classList.remove('hidden');
                        imageInput.removeAttribute('required');
                    } else {
                        imagePreview.classList.add('hidden');
                        imageInput.setAttribute('required', 'required');
                    }
                } catch (error) {
                    console.error('Failed to load field image:', error);
                    imagePreview.classList.add('hidden');
                    imageInput.setAttribute('required', 'required');
                }
            } else {
                imagePreview.classList.add('hidden');
                imageInput.setAttribute('required', 'required');
            }
        });
    }

    const giveawayUploadBtn = document.getElementById('giveaway-upload-btn');
    if (giveawayUploadBtn) giveawayUploadBtn.addEventListener('click', uploadAdminGiveaway);

    const galleryUploadBtn = document.getElementById('gallery-upload-btn');
    if (galleryUploadBtn) galleryUploadBtn.addEventListener('click', uploadGalleryImage);

    const categoryAddBtn = document.getElementById('category-add-btn');
    if (categoryAddBtn) categoryAddBtn.addEventListener('click', addCategory);

    const sponsorUploadBtn = document.getElementById('sponsor-upload-btn');
    if (sponsorUploadBtn) sponsorUploadBtn.addEventListener('click', uploadSponsor);

    console.log('Admin dashboard events initialized.');
}

// --- Training Management Functions ---
async function fetchTrainingData() {
    try {
        if (window.GlobalLoader) window.GlobalLoader.show();
        
        const response = await fetch('/api/admin/trainings', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch training data');
        
        const data = await response.json();
        
        // Fetch Training Schedules
        const schedulesResponse = await fetch('/api/admin/training-schedules', { credentials: 'include' });
        const schedulesData = await schedulesResponse.json();
        
        // Update Stats with animations
        animateCounter('stat-active-subscribers', data.stats.activeSubscribers);
        animateCounter('stat-monthly-revenue', data.stats.monthlyRevenue, ' ILS');
        animateCounter('stat-total-sessions', data.stats.totalSessions);
        animateCounter('stat-avg-attendance', data.stats.avgAttendance, '%');

        // Update Progress Bars
        updateProgressBar('stat-active-subscribers-bar', Math.min(100, (data.stats.activeSubscribers / 50) * 100)); // Goal 50
        updateProgressBar('stat-monthly-revenue-bar', Math.min(100, (data.stats.monthlyRevenue / 10000) * 100)); // Goal 10000
        updateProgressBar('stat-total-sessions-bar', Math.min(100, (data.stats.totalSessions / 200) * 100)); // Goal 200
        updateProgressBar('stat-avg-attendance-bar', data.stats.avgAttendance);
        
        renderTrainingSubscriptions(data.subscriptions);
        renderTrainingAttendance(data.attendance);
        renderCoachesList(data.coaches);
        renderTrainingSchedules(schedulesData.schedules);
        
    } catch (error) {
        console.error('Training data fetch failed:', error);
    } finally {
        if (window.GlobalLoader) window.GlobalLoader.hide();
    }
}

function renderTrainingSubscriptions(subscriptions) {
    const tbody = document.getElementById('subscribers-table-body');
    if (!tbody) return;
    
    if (!subscriptions || subscriptions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-12 text-center text-slate-400 font-bold">لا يوجد مشتركين نشطين</td></tr>';
        return;
    }
    
    tbody.innerHTML = subscriptions.map(sub => {
        const initials = sub.user_name.split(' ').map(n => n[0]).join('').toUpperCase();
        const creditsPercent = (sub.credits / 8) * 100;
        const statusColor = sub.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600';
        const statusText = sub.status === 'active' ? 'نشط' : 'منتهي';
        
        return `
            <tr class="hover:bg-slate-50/50 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-black text-xs">
                            ${initials}
                        </div>
                        <div>
                            <div class="font-black text-slate-800 text-sm">${sub.user_name}</div>
                            <div class="text-[10px] font-bold text-slate-400">${sub.phone_number || 'بدون هاتف'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="flex-grow bg-slate-100 h-1.5 rounded-full overflow-hidden max-w-[100px]">
                            <div class="h-full bg-orange-500" style="width: ${creditsPercent}%"></div>
                        </div>
                        <span class="font-black text-slate-700 text-sm">${sub.credits}/8</span>
                    </div>
                </td>
                <td class="px-6 py-4 font-bold text-slate-600 text-sm">${new Date(sub.end_date).toLocaleDateString('he-IL')}</td>
                <td class="px-6 py-4">
                    <span class="${statusColor} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">${statusText}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="editSubscription(${sub.id})" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="cancelSubscription(${sub.id})" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-all">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderTrainingAttendance(attendance) {
    const list = document.getElementById('recent-attendance-list');
    if (!list) return;
    
    if (!attendance || attendance.length === 0) {
        list.innerHTML = '<p class="text-center text-slate-400 font-bold py-4">لا يوجد سجلات حضور مؤخراً</p>';
        return;
    }
    
    list.innerHTML = attendance.map(log => `
        <div class="flex items-center gap-4 p-3 rounded-2xl border border-slate-50 hover:bg-slate-50 transition-colors">
            <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <i class="fa-solid fa-check"></i>
            </div>
            <div class="flex-grow">
                <h6 class="font-black text-slate-800 text-sm">${log.user_name}</h6>
                <p class="text-[10px] font-bold text-slate-400">${new Date(log.attended_at).toLocaleString('he-IL')}</p>
            </div>
            <div class="text-right">
                <span class="text-[9px] font-black text-blue-500 uppercase">بواسطة: ${log.coach_name || 'مدير'}</span>
            </div>
        </div>
    `).join('');
}

function renderCoachesList(coaches) {
    const grid = document.getElementById('coaches-grid');
    if (!grid) return;
    
    if (!coaches || coaches.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400 font-bold">لا يوجد مدربين مضافين</div>';
        return;
    }
    
    grid.innerHTML = coaches.map(coach => {
        const initials = coach.name.split(' ').map(n => n[0]).join('').toUpperCase();
        return `
            <div class="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group relative">
                <div class="flex items-center gap-4 mb-6">
                    <div class="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        <i class="fa-solid fa-user-tie text-xl"></i>
                    </div>
                    <div>
                        <h5 class="font-black text-slate-800">${coach.name}</h5>
                        <p class="text-xs font-bold text-slate-400">${coach.phone_number}</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-2">
                    <button onclick="regenerateCoachPassword(${coach.id})" 
                        class="flex-grow bg-slate-50 text-slate-600 py-3 rounded-xl font-bold text-xs hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                        <i class="fa-solid fa-key"></i>
                        تغيير كلمة المرور
                    </button>
                    <button onclick="deleteCoach(${coach.id})" 
                        class="w-11 h-11 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTrainingSchedules(schedules) {
    const grid = document.getElementById('training-schedules-grid');
    if (!grid) return;

    if (!schedules || schedules.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400 font-bold">لا يوجد أوقات تدريب مضافة</div>';
        return;
    }

    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    grid.innerHTML = schedules.map(schedule => {
        const isWeekly = schedule.day_of_week !== null;
        const timeStr = `${schedule.start_time} - ${schedule.end_time}`;
        const dayStr = isWeekly ? days[schedule.day_of_week] : new Date(schedule.specific_date).toLocaleDateString('he-IL');
        const typeBadge = isWeekly ? 'أسبوعي' : 'يوم محدد';
        const typeClass = isWeekly ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600';

        return `
            <div class="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
                <div class="flex items-start justify-between mb-4">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                        <i class="fa-solid ${isWeekly ? 'fa-calendar-week' : 'fa-calendar-day'} text-xl"></i>
                    </div>
                    <span class="${typeClass} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">${typeBadge}</span>
                </div>
                
                <div class="mb-6">
                    <h5 class="font-black text-slate-800 text-lg mb-1">${dayStr}</h5>
                    <p class="text-sm font-bold text-slate-500 flex items-center gap-2">
                        <i class="fa-solid fa-clock text-xs"></i>
                        ${timeStr}
                    </p>
                    <p class="text-xs font-bold text-indigo-500 mt-2 flex items-center gap-2">
                        <i class="fa-solid fa-location-dot text-xs"></i>
                        ${schedule.field_name}
                    </p>
                </div>

                <button onclick="deleteTrainingSchedule(${schedule.id})" 
                    class="w-full bg-slate-50 text-slate-400 py-3 rounded-xl font-bold text-xs hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-2">
                    <i class="fa-solid fa-trash-can"></i>
                    حذف الوقت
                </button>
            </div>
        `;
    }).join('');
}

function openAddCoachModal() {
    document.getElementById('add-coach-modal').classList.remove('hidden');
    document.getElementById('add-coach-form').reset();
}

function closeAddCoachModal() {
    document.getElementById('add-coach-modal').classList.add('hidden');
}

function generateRandomPassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 10; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('coach-password-input').value = password;
}

async function handleAddCoach() {
    const name = document.getElementById('coach-name-input').value;
    const phone = document.getElementById('coach-phone-input').value;
    const password = document.getElementById('coach-password-input').value;

    if (!name || !phone || !password) return;

    try {
        const response = await fetch('/api/admin/coaches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, password }),
            credentials: 'include'
        });

        if (response.ok) {
            showMessageBox('تم بنجاح', 'تم إنشاء حساب المدرب بنجاح.', 'success');
            closeAddCoachModal();
            fetchTrainingData();
        } else {
            const err = await response.json();
            showMessageBox('خطأ', err.error || 'فشل إنشاء الحساب', 'error');
        }
    } catch (error) {
        console.error('Add coach failed:', error);
        showMessageBox('خطأ', 'فشل الاتصال بالخادم', 'error');
    }
}

async function regenerateCoachPassword(id) {
    const newPassword = prompt('أدخل كلمة المرور الجديدة:');
    if (!newPassword) return;

    try {
        const response = await fetch(`/api/admin/coaches/${id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword }),
            credentials: 'include'
        });

        if (response.ok) {
            showMessageBox('تم بنجاح', 'تم تحديث كلمة المرور بنجاح.', 'success');
        } else {
            const err = await response.json();
            showMessageBox('خطأ', err.error || 'فشل تحديث كلمة المرور', 'error');
        }
    } catch (error) {
        console.error('Password reset failed:', error);
        showMessageBox('خطأ', 'فشل الاتصال بالخادم', 'error');
    }
}

async function deleteCoach(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المدرب؟')) return;

    try {
        const response = await fetch(`/api/admin/coaches/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            showMessageBox('تم بنجاح', 'تم حذف المدرب بنجاح.', 'success');
            fetchTrainingData();
        } else {
            const err = await response.json();
            showMessageBox('خطأ', err.error || 'فشل حذف المدرب', 'error');
        }
    } catch (error) {
        console.error('Delete coach failed:', error);
        showMessageBox('خطأ', 'فشل الاتصال بالخادم', 'error');
    }
}

function openAddSubscriberModal() {
    document.getElementById('add-subscriber-modal').classList.remove('hidden');
    document.getElementById('sub-start-date').valueAsDate = new Date();
}

function closeAddSubscriberModal() {
    document.getElementById('add-subscriber-modal').classList.add('hidden');
}

// --- Training Schedule Management ---
function openAddTrainingSlotModal() {
    document.getElementById('add-training-slot-modal').classList.remove('hidden');
    document.getElementById('add-training-slot-form').reset();
    toggleScheduleType(); // Reset visibility
}

function closeAddTrainingSlotModal() {
    document.getElementById('add-training-slot-modal').classList.add('hidden');
}

function toggleScheduleType() {
    const type = document.querySelector('input[name="schedule-type"]:checked').value;
    const dateContainer = document.getElementById('specific-date-container');
    const dayContainer = document.getElementById('weekly-day-container');
    
    if (type === 'date') {
        dateContainer.classList.remove('hidden');
        dayContainer.classList.add('hidden');
    } else {
        dateContainer.classList.add('hidden');
        dayContainer.classList.remove('hidden');
    }
}

async function handleAddTrainingSchedule() {
    const fieldId = document.getElementById('training-field-select').value;
    const type = document.querySelector('input[name="schedule-type"]:checked').value;
    const startTime = document.getElementById('training-start-time').value;
    const endTime = document.getElementById('training-end-time').value;
    
    let payload = {
        fieldId,
        startTime,
        endTime,
        dayOfWeek: null,
        specificDate: null
    };

    if (type === 'date') {
        payload.specificDate = document.getElementById('training-date').value;
        if (!payload.specificDate) return showMessageBox('خطأ', 'يرجى اختيار التاريخ', 'error');
    } else {
        payload.dayOfWeek = parseInt(document.getElementById('training-day').value);
    }

    if (!fieldId || !startTime || !endTime) {
        return showMessageBox('خطأ', 'يرجى إكمال جميع الحقول', 'error');
    }

    try {
        const response = await fetch('/api/admin/training-schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });

        if (response.ok) {
            showMessageBox('تم بنجاح', 'تم إضافة وقت التدريب بنجاح.', 'success');
            closeAddTrainingSlotModal();
            fetchTrainingData();
        } else {
            const err = await response.json();
            showMessageBox('خطأ', err.error || 'فشل إضافة الوقت', 'error');
        }
    } catch (error) {
        console.error('Add training schedule failed:', error);
        showMessageBox('خطأ', 'فشل الاتصال بالخادم', 'error');
    }
}

async function deleteTrainingSchedule(id) {
    if (!confirm('هل أنت متأكد من حذف وقت التدريب هذا؟')) return;

    try {
        const response = await fetch(`/api/admin/training-schedules/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            fetchTrainingData();
        } else {
            const err = await response.json();
            showMessageBox('خطأ', err.error || 'فشل الحذف', 'error');
        }
    } catch (error) {
        console.error('Delete training schedule failed:', error);
    }
}

async function searchPlayersForSubscription(query) {
    const resultsDiv = document.getElementById('player-search-results');
    if (!query || query.length < 2) {
        resultsDiv.classList.add('hidden');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/players/search?query=${encodeURIComponent(query)}`, { credentials: 'include' });
        const data = await response.json();
        const players = data.players || [];
        
        if (players.length === 0) {
            resultsDiv.innerHTML = '<div class="p-4 text-slate-400 text-sm text-center">لا يوجد نتائج</div>';
        } else {
            resultsDiv.innerHTML = players.map(p => `
                <div onclick="selectPlayerForSubscription(${p.id}, '${p.name}', '${p.phone_number || ''}')" 
                    class="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 flex items-center justify-between group">
                    <div>
                        <div class="font-black text-slate-800">${p.name}</div>
                        <div class="text-xs text-slate-400 font-bold">${p.phone_number || 'بدون هاتف'}</div>
                    </div>
                    <i class="fa-solid fa-plus text-slate-300 group-hover:text-orange-500 transition-colors"></i>
                </div>
            `).join('');
        }
        resultsDiv.classList.remove('hidden');
    } catch (error) {
        console.error('Player search failed:', error);
    }
}

function selectPlayerForSubscription(id, name, phone) {
    window.selectedPlayerForSub = { id, name, phone };
    document.getElementById('selected-player-name').textContent = name;
    document.getElementById('selected-player-phone').textContent = phone || 'بدون هاتف';
    document.getElementById('selected-player-initials').textContent = name.split(' ').map(n => n[0]).join('').toUpperCase();
    
    document.getElementById('selected-player-info').classList.remove('hidden');
    document.getElementById('player-search-results').classList.add('hidden');
    document.getElementById('player-search-input').value = '';
    document.getElementById('confirm-sub-btn').disabled = false;
}

function clearSelectedPlayer() {
    window.selectedPlayerForSub = null;
    document.getElementById('selected-player-info').classList.add('hidden');
    document.getElementById('confirm-sub-btn').disabled = true;
    document.getElementById('player-search-input').value = '';
}

async function confirmSubscription() {
    if (!window.selectedPlayerForSub) return;
    
    const startDate = document.getElementById('sub-start-date').value;
    const credits = document.getElementById('sub-credits').value;
    
    try {
        const response = await fetch('/api/admin/trainings/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: window.selectedPlayerForSub.id,
                startDate,
                credits
            }),
            credentials: 'include'
        });
        
        if (response.ok) {
            showMessageBox('تم التفعيل', 'تم إضافة اللاعب لنظام التمارين بنجاح.', 'success');
            closeAddSubscriberModal();
            fetchTrainingData();
        } else {
            const err = await response.json();
            showMessageBox('فشل التفعيل', err.error || 'حدث خطأ ما', 'error');
        }
    } catch (error) {
        console.error('Subscription failed:', error);
        showMessageBox('خطأ', 'فشل الاتصال بالخادم', 'error');
    }
}

async function cancelSubscription(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الاشتراك؟ سيتم مسح جميع بياناته.')) return;

    try {
        const response = await fetch(`/api/admin/trainings/subscriptions/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            showMessageBox('تم الحذف', 'تم حذف الاشتراك بنجاح', 'success');
            fetchTrainingData();
        } else {
            const err = await response.json();
            alert(err.error || 'فشل الحذف');
        }
    } catch (error) {
        console.error('Cancel failed:', error);
        alert('خطأ في الاتصال');
    }
}

async function editSubscription(id) {
    // For simplicity, we can use a prompt to edit credits
    const newCredits = prompt('أدخل عدد الجلسات الجديد:', '8');
    if (newCredits === null) return;

    const newStatus = confirm('هل الاشتراك لا يزال نشطاً؟ (إلغاء للإغلاق)') ? 'active' : 'expired';
    
    try {
        const response = await fetch(`/api/admin/trainings/subscriptions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credits: parseInt(newCredits),
                status: newStatus,
                end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Extend by 30 days or keep current
            }),
            credentials: 'include'
        });

        if (response.ok) {
            showMessageBox('تم التحديث', 'تم تحديث بيانات الاشتراك', 'success');
            fetchTrainingData();
        } else {
            const err = await response.json();
            alert(err.error || 'فشل التحديث');
        }
    } catch (error) {
        console.error('Edit failed:', error);
        alert('خطأ في الاتصال');
    }
}

function populateFieldDropdowns(fields) {
    const availabilitySelect = document.getElementById('availability-field-select');
    const masterFieldSelect = document.getElementById('master-field-select');
    const resFilterField = document.getElementById('res-filter-field');
    const tournamentSelect = document.getElementById('tournament-field');
    const trainingSelect = document.getElementById('training-field-select');

    if (availabilitySelect) availabilitySelect.innerHTML = '<option value="">كل الملاعب</option>';
    if (masterFieldSelect) masterFieldSelect.innerHTML = '<option value="">كل الملاعب</option>';
    if (resFilterField) resFilterField.innerHTML = '<option value="">جميع الملاعب</option>';
    if (tournamentSelect) tournamentSelect.innerHTML = '';
    if (trainingSelect) trainingSelect.innerHTML = '<option value="">اختر الملعب...</option>';

    fields.forEach(field => {
        const option = document.createElement('option');
        option.value = field.id;
        option.textContent = field.name;

        if (availabilitySelect) availabilitySelect.appendChild(option.cloneNode(true));
        if (masterFieldSelect) masterFieldSelect.appendChild(option.cloneNode(true));
        if (resFilterField) resFilterField.appendChild(option.cloneNode(true));
        if (trainingSelect) trainingSelect.appendChild(option.cloneNode(true));

        if (tournamentSelect) {
            const optionTourn = document.createElement('option');
            optionTourn.value = field.id;
            optionTourn.textContent = field.name;
            tournamentSelect.appendChild(optionTourn);
        }
    });
    if (tournamentSelect && tournamentSelect.options.length > 0) {
        tournamentSelect.dispatchEvent(new Event('change'));
    }
}

async function handleAddSlot() {
    const fieldId = document.getElementById('slot-field-id').value;
    const date = document.getElementById('slot-date').value;
    const slotInputs = document.getElementById('slots-container').querySelectorAll('div');
    const slots = Array.from(slotInputs).map(div => ({
        start: div.querySelector('input[name="start_time"]').value,
        end: div.querySelector('input[name="end_time"]').value
    }));

    try {
        const response = await fetch('/api/admin/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ fieldId, date, slots })
        });

        if (response.ok) {
            showMessageBox('تمت الإضافة بنجاح', 'تم إضافة المواعيد للملعب المحدد.', 'success');
            fetchAvailabilityForAdmin(fieldId);
            document.getElementById('slots-container').innerHTML = '';
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ في الإضافة', errorData.error);
        }
    } catch (error) {
        console.error('Failed to add slots:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}

// --- Tournament Modal Functions ---
async function openAddTournamentModal() {
    document.getElementById('add-tournament-modal').classList.remove('hidden');
    try {
        const response = await fetch('/api/admin/fields', {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error('Failed to fetch fields');
        }
        const data = await response.json();
        const fields = data.fields;
        populateFieldDropdowns(fields); // Reuse function
    } catch (error) {
        console.error('Failed to open tournament modal:', error);
        showMessageBox('خطأ في الاتصال', 'فشل تحميل قائمة الملاعب.', 'error');
    }
}

// Moved to initDashboardEvents()

function closeAddTournamentModal() {
    document.getElementById('add-tournament-modal').classList.add('hidden');
    document.getElementById('add-tournament-form').reset();
    document.getElementById('tournament-image-preview').classList.add('hidden');
}

async function handleAddTournament() {
    const name = document.getElementById('tournament-name').value;
    const description = document.getElementById('tournament-description').value;
    const prize = document.getElementById('tournament-prize').value;
    const date = document.getElementById('tournament-date').value;
    const fieldId = document.getElementById('tournament-field').value;
    const imageFile = document.getElementById('tournament-image').files[0];
    const imagePreviewSrc = document.getElementById('tournament-image-preview').src;

    let imageData = null;

    if (imageFile) {
        imageData = await fileToBase64(imageFile);
    } else if (imagePreviewSrc && !imagePreviewSrc.includes('placehold.co')) {
        imageData = imagePreviewSrc;
    } else {
        showMessageBox('خطأ في الصورة', 'يرجى اختيار صورة للبطولة.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/admin/tournaments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name,
                description,
                prize,
                date,
                fieldId,
                image: imageData
            })
        });

        if (response.ok) {
            closeAddTournamentModal();
            fetchData();
            showMessageBox('تمت الإضافة بنجاح', 'تم إضافة البطولة الجديدة.', 'success');
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ في الإضافة', errorData.error);
        }
    } catch (error) {
        console.error('Failed to add tournament:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}

async function deleteTournament(tournamentId) {
    showMessageBox(
        'تأكيد الحذف',
        'هل أنت متأكد من رغبتك في حذف هذه البطولة؟',
        'warning',
        async () => {
            try {
                const response = await fetch(`/api/admin/tournaments/${tournamentId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({})
                });

                if (response.ok) {
                    fetchData();
                    showMessageBox('تم الحذف', 'تم حذف البطولة بنجاح.', 'success');
                } else {
                    const errorData = await response.json();
                    showMessageBox('خطأ في الحذف', errorData.error);
                }
            } catch (error) {
                console.error('Failed to delete tournament:', error);
                showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
            }
        },
        true
    );
}

// --- Analytics Functions ---
async function loadAnalytics() {
    try {
        const response = await fetch(`/api/admin/analytics`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const data = await response.json();

        document.getElementById('total-users').textContent = data.totalUsers || 0;
        document.getElementById('total-reservations').textContent = data.totalReservations || 0;
        document.getElementById('total-earnings').textContent = `${data.totalEarnings || 0} ₪`;
        document.getElementById('pending-requests').textContent = data.pendingRequests || 0;

        const recentContainer = document.getElementById('recent-reservations');
        if (data.recentReservations && data.recentReservations.length > 0) {
            recentContainer.innerHTML = data.recentReservations.map(reservation => {
                const initials = reservation.user_name ? reservation.user_name.split(' ').map(n => n[0]).join('').toUpperCase() : '??';
                return `
                        <div class="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 group">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100 group-hover:text-emerald-500 transition-colors font-black text-sm">
                                    ${initials}
                                </div>
                                <div>
                                    <p class="font-black text-slate-800">${reservation.user_name}</p>
                                    <p class="text-xs text-slate-500 font-medium">${reservation.field_name} • ${reservation.slot_date} ${reservation.start_time}</p>
                                </div>
                            </div>
                            <div class="text-left">
                                <span class="text-lg font-black text-emerald-600">${reservation.price_per_hour} ₪</span>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">مدفوع</p>
                            </div>
                        </div>
                    `;
            }).join('');
        } else {
            recentContainer.innerHTML = `
                                <div class="py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <i class="fa-solid fa-box-open text-3xl mb-3 opacity-20"></i>
                                    <p class="text-sm font-medium">لا توجد حجوزات حديثة لعرضها</p>
                                </div>
                            `;
        }
    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

// --- Requests & Reservations Management Functions ---
async function approveMatchmakingRequest(requestId) {
    try {
        const response = await fetch(`/api/admin/matchmaking-requests/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({})
        });

        if (response.ok) {
            showMessageBox('تمت الموافقة', 'تم تأكيد طلب المطابقة بنجاح.', 'success');
            fetchData(); // Refresh all data
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ', errorData.error);
        }
    } catch (error) {
        console.error('Failed to approve request:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}

async function rejectMatchmakingRequest(requestId) {
    showMessageBox(
        'تأكيد الرفض',
        'هل أنت متأكد من رفض طلب المطابقة هذا؟',
        'warning',
        async () => {
            try {
                const response = await fetch(`/api/admin/matchmaking-requests/${requestId}/reject`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({})
                });

                if (response.ok) {
                    showMessageBox('تم الرفض', 'تم رفض طلب المطابقة بنجاح.', 'success');
                    fetchData();
                } else {
                    const errorData = await response.json();
                    showMessageBox('خطأ', errorData.error);
                }
            } catch (error) {
                console.error('Failed to reject request:', error);
                showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
            }
        },
        true
    );
}

async function cancelReservation(reservationId) {
    showMessageBox(
        'تأكيد الإلغاء',
        'هل أنت متأكد من رغبتك في إلغاء هذا الحجز؟',
        'warning',
        async () => {
            try {
                const response = await fetch(`/api/admin/reservations/${reservationId}/cancel`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({})
                });

                if (response.ok) {
                    fetchData();
                    showMessageBox('تم الإلغاء', 'تم إلغاء الحجز بنجاح.', 'success');
                } else {
                    const errorData = await response.json();
                    showMessageBox('خطأ', errorData.error);
                }
            } catch (error) {
                console.error('Failed to cancel reservation:', error);
                showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
            }
        },
        true
    );
}

// --- Smart Slot Creator Functions ---
function toggleBatchCreator() {
    const panel = document.getElementById('batch-creator-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        loadBatchFields();
        populateTimeDropdowns();

        // Set default date to today
        if (!document.getElementById('batch-date-start').value) {
            document.getElementById('batch-date-start').value = new Date().toISOString().split('T')[0];
        }

        // Attach listeners for live preview if not already attached
        const inputs = [
            'batch-time-hhmm', 'batch-time-ampm',
            'batch-date-start', 'batch-recur-start', 'batch-recur-end'
        ];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.dataset.listener) {
                el.addEventListener('input', previewBatchSlots);
                el.addEventListener('change', previewBatchSlots);
                el.dataset.listener = 'true';
            }
        });

        // Checkboxes
        document.querySelectorAll('#recurring-date-container input[type="checkbox"], #batch-fields-list input[type="checkbox"]').forEach(cb => {
            if (!cb.dataset.listener) {
                cb.addEventListener('change', previewBatchSlots);
                cb.dataset.listener = 'true';
            }
        });

        previewBatchSlots();
    }
}

function populateTimeDropdowns() {
    const hhmmSelect = document.getElementById('batch-time-hhmm');
    if (!hhmmSelect || hhmmSelect.options.length > 0) return;

    const times = [];
    // Populate with 01:00 to 12:50
    for (let h = 1; h <= 12; h++) {
        for (let m = 0; m < 60; m += 10) {
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            times.push(`${hh}:${mm}`);
        }
    }

    times.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        hhmmSelect.appendChild(opt);
    });

    // Default values
    hhmmSelect.value = "05:00";
    document.getElementById('batch-time-ampm').value = "PM";
}

function setBatchDuration(mins) {
    document.getElementById('batch-duration').value = mins;

    // Update active state of buttons
    document.querySelectorAll('.duration-btn').forEach(btn => {
        if (parseInt(btn.dataset.mins) === mins) {
            btn.classList.add('border-purple-500', 'text-purple-600', 'bg-purple-50', 'border-2');
            btn.classList.remove('border-slate-100', 'text-slate-600');
        } else {
            btn.classList.remove('border-purple-500', 'text-purple-600', 'bg-purple-50', 'border-2');
            btn.classList.add('border-slate-100', 'text-slate-600');
        }
    });

    previewBatchSlots();
}

function loadBatchFields() {
    const container = document.getElementById('batch-fields-list');
    if (!container) return;

    // Check if we have fields already loaded in window.adminFields
    const fields = window.adminFields || [];
    if (fields.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400">يرجى تحميل الملاعب أولاً...</p>';
        return;
    }

    container.innerHTML = fields.map(f => `
                <label class="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 cursor-pointer hover:border-purple-200 transition-all">
                    <input type="checkbox" name="batch-field" value="${f.id}" class="rounded border-slate-300 text-purple-600 focus:ring-purple-500">
                    <span class="text-sm font-medium text-slate-700">${f.name}</span>
                </label>
            `).join('');
}

function calculateGeneratedSlots() {
    const time12 = document.getElementById('batch-time-hhmm').value;
    const ampm = document.getElementById('batch-time-ampm').value;
    const duration = parseInt(document.getElementById('batch-duration').value);

    if (!time12 || isNaN(duration)) return [];

    let [h12, m] = time12.split(':').map(Number);
    let h24 = h12 % 12;
    if (ampm === 'PM') h24 += 12;

    const startTimeStr = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    let totalMinutes = h24 * 60 + m + duration;

    let endH = Math.floor(totalMinutes / 60) % 24;
    let endM = totalMinutes % 60;

    const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    // Simple one-slot creation per user request
    return [{ start: startTimeStr, end: endTimeStr }];
}

let availabilityView = 'daily';

function switchAvailabilityView(view) {
    availabilityView = view;
    const dailyView = document.getElementById('availability-daily-view');
    const masterView = document.getElementById('availability-master-view');
    const dailyBtn = document.getElementById('view-daily-btn');
    const masterBtn = document.getElementById('view-master-btn');

    if (view === 'daily') {
        dailyView.classList.remove('hidden');
        masterView.classList.add('hidden');
        dailyBtn.classList.add('bg-white', 'shadow-sm', 'text-purple-600');
        dailyBtn.classList.remove('text-slate-500');
        masterBtn.classList.remove('bg-white', 'shadow-sm', 'text-purple-600');
        masterBtn.classList.add('text-slate-500');
        loadAvailabilitySlots();
    } else {
        dailyView.classList.add('hidden');
        masterView.classList.remove('hidden');
        masterBtn.classList.add('bg-white', 'shadow-sm', 'text-purple-600');
        masterBtn.classList.remove('text-slate-500');
        dailyBtn.classList.remove('bg-white', 'shadow-sm', 'text-purple-600');
        dailyBtn.classList.add('text-slate-500');
        loadMasterRules();
    }
}

let batchMode = 'single';

function setBatchMode(mode) {
    batchMode = mode;
    const single = document.getElementById('single-date-container');
    const recurring = document.getElementById('recurring-date-container');
    const btnSingle = document.getElementById('btn-mode-single');
    const btnRecurring = document.getElementById('btn-mode-recurring');

    if (mode === 'single') {
        single.classList.remove('hidden');
        recurring.classList.add('hidden');
        btnSingle.classList.add('bg-white', 'shadow-sm', 'text-purple-600');
        btnSingle.classList.remove('text-slate-500');
        btnRecurring.classList.remove('bg-white', 'shadow-sm', 'text-purple-600');
        btnRecurring.classList.add('text-slate-500');
    } else {
        single.classList.add('hidden');
        recurring.classList.remove('hidden');
        btnRecurring.classList.add('bg-white', 'shadow-sm', 'text-purple-600');
        btnRecurring.classList.remove('text-slate-500');
        btnSingle.classList.remove('bg-white', 'shadow-sm', 'text-purple-600');
        btnSingle.classList.add('text-slate-500');

        // Set default values
        const endInput = document.getElementById('batch-recur-end');
        if (endInput && !endInput.value) {
            const later = new Date();
            later.setDate(later.getDate() + 60); // Default to 2 months for recurring patterns
            endInput.value = later.toISOString().split('T')[0];
        }
    }
    previewBatchSlots();
}


function previewBatchSlots() {
    const slots = calculateGeneratedSlots();
    const fieldCount = Array.from(document.querySelectorAll('input[name="batch-field"]:checked')).length;

    let dateCount = 1;
    if (batchMode === 'recurring') {
        const start = new Date(document.getElementById('batch-recur-start').value);
        const end = new Date(document.getElementById('batch-recur-end').value);
        const days = Array.from(document.querySelectorAll('#recurring-date-container input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));

        if (start && end && !isNaN(start) && !isNaN(end) && days.length > 0) {
            dateCount = 0;
            let curr = new Date(start);
            while (curr <= end) {
                if (days.includes(curr.getDay())) dateCount++;
                curr.setDate(curr.getDate() + 1);
            }
        }
    }

    const total = slots.length * fieldCount * dateCount;
    const previewEl = document.getElementById('batch-preview-count');
    previewEl.innerHTML = `سيتم توليد <span class="text-purple-600 font-bold">${total}</span> موعد في <span class="text-slate-800 font-bold">${dateCount}</span> أيام`;

    if (total > 200) {
        previewEl.innerHTML += ` <span class="text-amber-500 text-xs font-bold"> (كمية كبيرة جداً!)</span>`;
    }

    const logicInfo = document.getElementById('recurring-logic-info');
    if (batchMode === 'recurring') {
        logicInfo.classList.remove('opacity-20');
        logicInfo.querySelector('span').innerText = 'الوضع المتكرر يحفظ هذا النمط كـ "جدول ثابت" للمستقبل.';
    } else {
        logicInfo.classList.add('opacity-20');
        logicInfo.querySelector('span').innerText = 'هذه المواعيد لمرة واحدة فقط ولن تتكرر أسبوعياً.';
    }
}

async function handleBatchCreate() {
    const fieldIds = Array.from(document.querySelectorAll('input[name="batch-field"]:checked')).map(cb => cb.value);

    let targetDates = [];
    if (batchMode === 'single') {
        const date = document.getElementById('batch-date-start').value;
        if (date) targetDates.push(date);
    } else {
        // Start from Today
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const endVal = document.getElementById('batch-recur-end').value;
        const end = endVal ? new Date(endVal) : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days default
        end.setHours(23, 59, 59, 999);

        const days = Array.from(document.querySelectorAll('#recurring-date-container input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));

        if (!isNaN(start) && !isNaN(end) && days.length > 0) {
            let curr = new Date(start);
            while (curr <= end) {
                if (days.includes(curr.getDay())) {
                    targetDates.push(curr.toISOString().split('T')[0]);
                }
                curr.setDate(curr.getDate() + 1);
            }
        }
    }

    const slots = calculateGeneratedSlots();

    if (fieldIds.length === 0 || targetDates.length === 0 || slots.length === 0) {
        showMessageBox('تنبيه', 'يرجى اختيار ملاعب وأيام ونطاق زمني صحيح.', 'warning');
        return;
    }

    if (targetDates.length > 50) {
        if (!confirm(`سيتم إنشاء مواعيد لـ ${targetDates.length} يوماً. هل تريد الاستمرار؟`)) return;
    }

    try {
        const response = await fetch('/api/admin/availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fieldIds,
                dates: targetDates,
                slots,
                isRecurring: (batchMode === 'recurring')
            })
        });

        if (response.ok) {
            showMessageBox('نجاح', `تمت إضافة المواعيد بنجاح لـ ${targetDates.length} يوماً!`, 'success');
            toggleBatchCreator();
            loadAvailabilitySlots();
        } else {
            const err = await response.json();
            showMessageBox('خطأ', err.error || 'فشل إضافة المواعيد', 'error');
        }
    } catch (error) {
        console.error('Batch create failed:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.', 'error');
    }
}

async function loadAvailabilitySlots() {
    const container = document.getElementById('availability-slots-container');
    if (!container) return;

    try {
        const startInput = document.getElementById('availability-date-start');
        const endInput = document.getElementById('availability-date-end');
        const fieldSelect = document.getElementById('availability-field-select');

        // Robust date formatting (YYYY-MM-DD)
        const getTodayStr = () => {
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        };

        // Set default dates if empty
        if (startInput && !startInput.value) {
            startInput.value = getTodayStr();
        }
        if (endInput && !endInput.value) {
            endInput.value = getTodayStr();
        }

        const fieldId = fieldSelect ? fieldSelect.value : '';
        const startDate = startInput ? startInput.value : '';
        const endDate = endInput ? endInput.value : '';

        // Show loading state
        container.innerHTML = `
                <div class="col-span-full py-20 text-center">
                    <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
                    <p class="text-slate-500 font-medium">جاري جلب المواعيد...</p>
                </div>
            `;

        let url = `/api/admin/availability?`;
        const params = new URLSearchParams();
        if (fieldId) params.append('fieldId', fieldId);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        url += params.toString();

        // Update status text
        const statusText = document.getElementById('filter-status-text');
        if (statusText) {
            if (!startDate && !endDate) statusText.textContent = "عرض المواعيد القادمة";
            else statusText.textContent = `عرض من ${startDate || '...'} إلى ${endDate || '...'}`;
        }

        const response = await fetch(url, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch availability');
        const data = await response.json();

        container.innerHTML = '';
        let availability = data.availability || [];

        if (availability && availability.length > 0) {
            container.innerHTML = availability.map(slot => {
                const isReserved = slot.is_reserved !== 0;
                const statusColor = isReserved ? 'amber' : 'emerald';
                const statusIcon = isReserved ? 'fa-lock' : 'fa-unlock';
                const statusLabel = isReserved ? `محجوز (${slot.user_name || '؟'})` : 'متاح';

                // Recurring badge
                const recurringBadge = slot.is_recurring
                    ? `<div class="bg-purple-50 text-purple-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-100 uppercase tracking-tighter">مجدول</div>`
                    : `<div class="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-200 uppercase tracking-tighter">يدوي</div>`;

                return `
                    <div class="animate-slide-up bg-white rounded-3xl border border-slate-200/60 p-6 hover:shadow-xl hover:shadow-purple-500/5 transition-all group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-1.5 h-full bg-${statusColor}-500"></div>
                        
                        <div class="flex items-center justify-between mb-5">
                            <div class="flex items-center gap-2">
                                <div class="px-3 py-1.5 bg-slate-50 rounded-xl text-xs font-black text-slate-600 border border-slate-100">
                                    <i class="fa-solid fa-clock mr-1 text-purple-400"></i> ${slot.start_time} - ${slot.end_time}
                                </div>
                                ${recurringBadge}
                            </div>
                            <div class="text-${statusColor}-600 text-[10px] font-black flex items-center gap-1 uppercase bg-${statusColor}-50 px-2 py-1 rounded-lg">
                                <i class="fa-solid ${statusIcon}"></i>
                                ${statusLabel}
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-4 mb-6">
                            <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                                 <i class="fa-solid fa-futbol text-xl"></i>
                            </div>
                            <div>
                                <p class="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-0.5">${slot.field_name}</p>
                                <p class="text-sm font-black text-slate-800">${slot.slot_date}</p>
                            </div>
                        </div>
                        
                        <div class="flex gap-3">
                            <button onclick="editAvailabilitySlot(${slot.id}, '${slot.start_time}', '${slot.end_time}', '${slot.slot_date}', ${slot.field_id})" 
                                class="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-200 flex items-center justify-center gap-2">
                                <i class="fa-solid fa-pen-to-square text-purple-400"></i> تعديل
                            </button>
                            <button onclick="deleteAvailabilitySlot(${slot.id})" 
                                class="flex-1 bg-white hover:bg-red-50 text-red-500 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border border-red-100 flex items-center justify-center gap-2">
                                <i class="fa-solid fa-trash-can"></i> حذف
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<p class="text-gray-500 text-center col-span-full">لا توجد مواعيد متاحة للفلاتر المحددة</p>';
        }
    } catch (error) {
        console.error('Failed to load availability slots:', error);
        container.innerHTML = '<p class="text-red-500 text-center col-span-full">خطأ في تحميل المواعيد</p>';
    }
}

function setViewingPreset(type, event) {
    const startInput = document.getElementById('availability-date-start');
    const endInput = document.getElementById('availability-date-end');
    const today = new Date();

    // Use local time for correct comparison (YYYY-MM-DD)
    const formatDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Current active buttons styling
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('border-purple-500', 'bg-purple-50', 'text-purple-600', 'border-2');
        btn.classList.add('bg-slate-50', 'border-slate-100', 'text-slate-600');
    });

    if (type === 'today') {
        startInput.value = formatDate(today);
        endInput.value = formatDate(today);
    } else if (type === 'week') {
        startInput.value = formatDate(today);
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        endInput.value = formatDate(nextWeek);
    } else if (type === 'month') {
        startInput.value = formatDate(today);
        const nextMonth = new Date();
        nextMonth.setMonth(today.getMonth() + 1);
        endInput.value = formatDate(nextMonth);
    }

    // Highlight active button
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('border-purple-500', 'bg-purple-50', 'text-purple-600', 'border-2');
        event.currentTarget.classList.remove('bg-slate-50', 'border-slate-100', 'text-slate-600');
    }

    loadAvailabilitySlots();
}

function clearAvailabilityFilters() {
    document.getElementById('availability-field-select').value = '';
    document.getElementById('availability-date-start').value = '';
    document.getElementById('availability-date-end').value = '';

    // Reset preset buttons styling
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('border-purple-500', 'bg-purple-50', 'text-purple-600', 'border-2');
        btn.classList.add('bg-slate-50', 'border-slate-100', 'text-slate-600');
    });

    loadAvailabilitySlots();
}

async function deleteAvailabilitySlot(slotId) {
    showMessageBox(
        'تأكيد الحذف',
        'هل أنت متأكد من رغبتك في حذف هذا الموعد؟',
        'warning',
        async () => {
            try {
                const response = await fetch(`/api/admin/availability/${slotId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({})
                });

                if (response.ok) {
                    loadAvailabilitySlots();
                    showMessageBox('تم الحذف', 'تم حذف الموعد بنجاح.', 'success');
                } else {
                    const errorData = await response.json();
                    showMessageBox('خطأ', errorData.error);
                }
            } catch (error) {
                console.error('Failed to delete availability slot:', error);
                showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
            }
        }
    );
}

// --- MASTER VIEW LOGIC ---

async function loadMasterRules() {
    const fieldId = document.getElementById('master-field-select') ? document.getElementById('master-field-select').value : '';
    const container = document.getElementById('master-rules-container');
    if (!container) return;

    container.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold">جاري تحميل الجدول الثابت...</div>`;

    try {
        const response = await fetch('/api/admin/availability/rules', { credentials: 'include' });
        const data = await response.json();

        // Group rules by day
        const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const rulesByDay = [0, 1, 2, 3, 4, 5, 6].map(d => ({
            dayName: days[d],
            rules: (data.rules || []).filter(r => r.day_of_week === d && (!fieldId || r.field_id == fieldId))
        }));

        container.innerHTML = rulesByDay.map(day => `
            <div class="bg-white rounded-3xl border border-slate-200/60 p-4 shadow-sm min-h-[400px]">
                <div class="text-center pb-4 mb-4 border-b border-slate-100">
                    <h6 class="font-black text-slate-800 text-xs uppercase tracking-tighter">${day.dayName}</h6>
                </div>
                <div class="space-y-3">
                    ${day.rules.length > 0 ? day.rules.map(rule => `
                        <div class="bg-slate-50 rounded-2xl p-3 border border-slate-100 hover:border-purple-200 transition-all group">
                            <div class="text-[10px] font-black text-slate-500 mb-1">${rule.start_time} - ${rule.end_time}</div>
                            <div class="text-[9px] font-bold text-purple-500 uppercase mb-2">${rule.field_name}</div>
                            <button onclick="deleteMasterRule(${rule.id})" 
                                class="w-full py-1 text-[9px] font-black text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100 md:opacity-0 group-hover:opacity-100">
                                <i class="fa-solid fa-trash-can mr-1"></i> حذف
                            </button>
                        </div>
                    `).join('') : '<p class="text-[10px] text-slate-300 text-center py-8">لا توجد أنماط</p>'}
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load master rules:', err);
        container.innerHTML = '<p class="col-span-full text-red-500 text-center">خطأ في تحميل الجدول</p>';
    }
}

async function deleteMasterRule(ruleId) {
    showMessageBox(
        'حذف نمط متكرر',
        'سيتم حذف هذا النمط وجميع المواعيد المستقبلية (غير المحجوزة) المرتبطة به. هل أنت متأكد؟',
        'warning',
        async () => {
            try {
                const response = await fetch(`/api/admin/availability/rules/${ruleId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                if (response.ok) {
                    loadMasterRules();
                    showMessageBox('تم الحذف', 'تم إلغاء النمط المتكرر وتصفية المواعيد المستقبلية.', 'success');
                }
            } catch (err) {
                console.error('Delete rule failed:', err);
            }
        }
    );
}

function editAvailabilitySlot(slotId, startTime, endTime, date, fieldId) {
    document.getElementById('edit-slot-id').value = slotId;
    document.getElementById('edit-slot-start-time').value = startTime;
    document.getElementById('edit-slot-end-time').value = endTime;
    document.getElementById('edit-slot-date').value = date;
    document.getElementById('edit-slot-field-id').value = fieldId;
    document.getElementById('edit-slot-modal').classList.remove('hidden');
}

function closeEditSlotModal() {
    document.getElementById('edit-slot-modal').classList.add('hidden');
    document.getElementById('edit-slot-form').reset();
}

async function handleEditSlot() {
    const slotId = document.getElementById('edit-slot-id').value;
    const startTime = document.getElementById('edit-slot-start-time').value;
    const endTime = document.getElementById('edit-slot-end-time').value;
    const date = document.getElementById('edit-slot-date').value;
    const fieldId = document.getElementById('edit-slot-field-id').value;

    try {
        const response = await fetch(`/api/admin/availability/${slotId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                start_time: startTime,
                end_time: endTime,
                slot_date: date,
                field_id: fieldId
            })
        });

        if (response.ok) {
            closeEditSlotModal();
            loadAvailabilitySlots();
            showMessageBox('تم التحديث', 'تم تحديث الموعد بنجاح.', 'success');
        } else {
            const errorData = await response.json();
            showMessageBox('خطأ في التحديث', errorData.error);
        }
    } catch (error) {
        console.error('Failed to edit availability slot:', error);
        showMessageBox('خطأ في الشبكة', 'فشل الاتصال بالخادم.');
    }
}
// --- Players Management Functions ---
async function fetchPlayers() {
    console.log('fetchPlayers: Link only for now');
}

// --- Tournament Management Functions ---
async function fetchTournaments() {
    try {
        const response = await fetch('/api/admin/tournaments', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch tournaments');

        const data = await response.json();
        renderTournamentsList(data.tournaments);
    } catch (error) {
        console.error('Failed to fetch tournaments:', error);
        showMessageBox('خطأ في تحميل البيانات', 'فشل تحميل بيانات البطولات.', 'error');
    }
}

function renderTournamentsList(tournaments) {
    const container = document.getElementById('tournaments-list');

    if (!tournaments || tournaments.length === 0) {
        container.innerHTML = `
                    <div class="col-span-full text-center py-12">
                        <i class="fa-solid fa-trophy text-6xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">لا توجد بطولات متاحة</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = tournaments.map(tournament => `
                <div class="bg-gradient-to-br from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                    <div class="text-center">
                        <div class="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fa-solid fa-trophy text-2xl text-orange-600"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">${tournament.name}</h3>
                        <div class="space-y-2 text-sm text-gray-600">
                            <p><i class="fa-solid fa-calendar ml-1 text-orange-500"></i> ${tournament.tournament_date}</p>
                            ${tournament.prize ? `<p><i class="fa-solid fa-gift ml-1 text-orange-500"></i> ${tournament.prize}</p>` : ''}
                            <p><i class="fa-solid fa-map-marker-alt ml-1 text-orange-500"></i> ${tournament.field_name}</p>
                        </div>
                        <div class="mt-4 flex gap-2">
                            <button onclick="viewTournamentTeams(${tournament.id}, '${tournament.name}')" 
                                    class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                                <i class="fa-solid fa-users ml-1"></i>
                                عرض الفرق
                            </button>
                            <button onclick="deleteTournament(${tournament.id})" 
                                    class="bg-red-600 text-white py-2 px-3 rounded-lg hover:bg-red-700 transition-colors text-sm">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
}

async function viewTournamentTeams(tournamentId, tournamentName) {
    try {
        // Hide tournaments list and show teams section
        document.getElementById('tournaments-list').parentElement.classList.add('hidden');
        document.getElementById('tournament-teams-section').classList.remove('hidden');
        document.getElementById('selected-tournament-name').textContent = `فرق ${tournamentName}`;

        // Fetch tournament teams
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/teams`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch tournament teams');

        const data = await response.json();
        renderTournamentTeams(data.teams);
    } catch (error) {
        console.error('Failed to fetch tournament teams:', error);
        showMessageBox('خطأ في تحميل البيانات', 'فشل تحميل بيانات فرق البطولة.', 'error');
    }
}

function renderTournamentTeams(teams) {
    const container = document.getElementById('tournament-teams-container');
    const noMessage = document.getElementById('no-teams-message');

    if (!teams || teams.length === 0) {
        container.innerHTML = '';
        noMessage.classList.remove('hidden');
        return;
    }

    noMessage.classList.add('hidden');

    container.innerHTML = teams.map(team => {
        const statusColor = team.status === 'approved' ? 'green' :
            team.status === 'rejected' ? 'red' : 'yellow';
        const statusText = team.status === 'approved' ? 'مقبول' :
            team.status === 'rejected' ? 'مرفوض' : 'في الانتظار';

        const membersHtml = team.members.map(member => `
                    <div class="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 hover:shadow-sm transition-all duration-200">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-2">
                                    <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                        ${member.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p class="font-semibold text-gray-800">${member.name}</p>
                                        ${member.is_captain ? `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">قائد الفريق</span>` : ''}
                                    </div>
                                </div>
                                <div class="space-y-1 text-sm text-gray-600 mr-10">
                                    <p class="flex items-center gap-2">
                                        <i class="fa-solid fa-envelope text-blue-500 w-4"></i>
                                        ${member.email}
                                    </p>
                                    ${member.phone_number ? `
                                        <p class="flex items-center gap-2">
                                            <i class="fa-solid fa-phone text-green-500 w-4"></i>
                                            ${member.phone_number}
                                        </p>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');

        return `
                    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
                        <div class="flex justify-between items-start mb-6">
                            <div class="flex-1">
                                <div class="flex items-center gap-3 mb-4">
                                    <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg">
                                        ${team.team_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 class="text-xl font-bold text-gray-800 mb-1">${team.team_name}</h3>
                                        <span class="bg-${statusColor}-100 text-${statusColor}-800 px-3 py-1 rounded-full text-sm font-medium">
                                            ${statusText}
                                        </span>
                                    </div>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                                    <div class="flex items-center gap-2">
                                        <i class="fa-solid fa-user-tie text-blue-500 w-4"></i>
                                        <span>قائد الفريق: <strong>${team.captain_name}</strong></span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <i class="fa-solid fa-users text-green-500 w-4"></i>
                                        <span><strong>${team.team_size}</strong> لاعبين</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <i class="fa-solid fa-envelope text-purple-500 w-4"></i>
                                        <span>${team.captain_email}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <i class="fa-solid fa-calendar text-orange-500 w-4"></i>
                                        <span>${new Date(team.registration_date).toLocaleDateString('en-US')}</span>
                                    </div>
                                    ${team.captain_phone ? `
                                        <div class="flex items-center gap-2 md:col-span-2">
                                            <i class="fa-solid fa-phone text-green-500 w-4"></i>
                                            <span>${team.captain_phone}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="text-right">
                                <button onclick="deleteTeam(${team.id}, '${team.team_name}')" 
                                        class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-all duration-200 text-sm flex items-center gap-2 shadow-md hover:shadow-lg">
                                    <i class="fa-solid fa-trash"></i>
                                    حذف الفريق
                                </button>
                            </div>
                        </div>
                        
                        <div class="border-t pt-6">
                            <div class="flex items-center justify-between mb-4">
                                <h4 class="font-bold text-gray-700 flex items-center gap-2">
                                    <i class="fa-solid fa-users text-blue-500"></i>
                                    أعضاء الفريق
                                </h4>
                                <span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                                    ${team.team_size} عضو
                                </span>
                            </div>
                            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                ${membersHtml}
                            </div>
                        </div>
                    </div>
                `;
    }).join('');
}

function closeTournamentTeams() {
    document.getElementById('tournament-teams-section').classList.add('hidden');
    document.getElementById('tournaments-list').parentElement.classList.remove('hidden');
}

// Delete team function
async function deleteTeam(teamId, teamName) {
    if (!confirm(`هل أنت متأكد من حذف فريق "${teamName}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/teams/${teamId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to delete team');

        showMessageBox('تم الحذف بنجاح', `تم حذف فريق "${teamName}" بنجاح.`, 'success');

        // Refresh the teams list
        const currentTournamentId = document.querySelector('[onclick*="viewTournamentTeams"]')?.getAttribute('onclick')?.match(/\d+/)?.[0];
        if (currentTournamentId) {
            viewTournamentTeams(currentTournamentId, '');
        }

    } catch (error) {
        console.error('Error deleting team:', error);
        showMessageBox('خطأ في الحذف', 'فشل في حذف الفريق. يرجى المحاولة مرة أخرى.', 'error');
    }
}

// --- Birthday Users Functions ---
async function fetchBirthdayUsers() {
    try {
        const response = await fetch('/api/users/upcoming-birthdays');
        if (!response.ok) throw new Error('Failed to fetch birthday users');

        const data = await response.json();
        renderBirthdayUsers(data.users);
    } catch (error) {
        console.error('Failed to fetch birthday users:', error);
        showMessageBox('خطأ في تحميل البيانات', 'فشل تحميل بيانات أعياد الميلاد.', 'error');
    }
}

function renderBirthdayUsers(users) {
    const container = document.getElementById('birthday-users-container');
    const noMessage = document.getElementById('no-birthdays-message');

    if (!users || users.length === 0) {
        container.innerHTML = '';
        noMessage.classList.remove('hidden');
        return;
    }

    noMessage.classList.add('hidden');

    container.innerHTML = users.map(user => {
        const birthDate = new Date(user.birthdate);
        const today = new Date();
        const currentYear = today.getFullYear();

        // Calculate this year's birthday
        const thisYearBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());

        // If birthday already passed this year, calculate next year's birthday
        if (thisYearBirthday < today) {
            thisYearBirthday.setFullYear(currentYear + 1);
        }

        // Calculate days until birthday
        const timeDiff = thisYearBirthday.getTime() - today.getTime();
        const daysUntil = Math.ceil(timeDiff / (1000 * 3600 * 24));

        const formattedDate = birthDate.toLocaleDateString('ar-EG', {
            day: 'numeric',
            month: 'long'
        });

        const sexText = user.gender === 'male' ? 'ذكر' : user.gender === 'female' ? 'أنثى' : '';

        return `
                    <div class="bg-gradient-to-br from-pink-50 to-purple-50 border border-pink-200 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                        <div class="text-center">
                            <div class="bg-pink-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i class="fa-solid fa-birthday-cake text-2xl text-pink-600"></i>
                            </div>
                            <h3 class="text-xl font-bold text-gray-800 mb-2">${user.name}</h3>
                            <div class="space-y-2 text-sm text-gray-600">
                                <p><i class="fa-solid fa-envelope ml-1 text-pink-500"></i> ${user.email}</p>
                                <p><i class="fa-solid fa-phone ml-1 text-pink-500"></i> ${user.phone_number || 'غير محدد'}</p>
                                ${sexText ? `<p><i class="fa-solid fa-user ml-1 text-pink-500"></i> ${sexText}</p>` : ''}
                                <p><i class="fa-solid fa-calendar ml-1 text-pink-500"></i> ${formattedDate}</p>
                            </div>
                            <div class="mt-4 bg-pink-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                                ${daysUntil === 0 ? 'اليوم!' : daysUntil === 1 ? 'غداً' : `خلال ${daysUntil} أيام`}
                            </div>
                        </div>
                    </div>
                `;
    }).join('');
}

// Gallery functions
async function fetchAdminGallery() {
    const container = document.getElementById('admin-gallery-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-500">جاري تحميل الصور...</p>';
    try {
        const res = await fetch('/api/gallery');
        const data = await res.json();
        container.innerHTML = '';
        if (res.ok && data.images && data.images.length) {
            data.images.forEach(img => {
                const card = document.createElement('div');
                card.className = 'bg-white p-3 rounded-xl shadow border border-gray-200';
                const imageUrl = img.image_url || `https://placehold.co/400x300/3b82f6/ffffff?text=${encodeURIComponent(img.title || 'صورة')}`;
                card.innerHTML = `
                            <img src="${imageUrl}" alt="${img.title || 'صورة'}" class="rounded-lg w-full h-40 object-cover mb-2" loading="lazy" decoding="async"
                                 onerror="this.onerror=null;this.src='https://placehold.co/400x300/3b82f6/ffffff?text=${encodeURIComponent(img.title || 'صورة')}'">
                            ${img.title ? `<div class=\"text-sm text-gray-700 text-center mb-2\">${img.title}</div>` : ''}
                            <div class="text-center flex gap-2 justify-center">
                                <button class="text-blue-600 hover:text-blue-800 font-bold text-sm edit-image-btn" data-id="${img.id}" data-title="${img.title || ''}" data-category="${img.category_id || ''}">
                                    <i class="fa-solid fa-edit ml-1"></i> تعديل
                                </button>
                                <button class="text-red-600 hover:text-red-800 font-bold text-sm delete-image-btn" data-id="${img.id}">
                                    <i class="fa-solid fa-trash ml-1"></i> حذف
                                </button>
                            </div>
                        `;
                container.appendChild(card);
            });
            container.querySelectorAll('.delete-image-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteGalleryImage(btn.dataset.id));
            });
            container.querySelectorAll('.edit-image-btn').forEach(btn => {
                btn.addEventListener('click', () => openEditImageModal(btn.dataset.id, btn.dataset.title, btn.dataset.category));
            });
        } else {
            container.innerHTML = '<p class="text-center text-gray-500">لا توجد صور بعد.</p>';
        }
    } catch (e) {
        console.error('Failed to load gallery', e);
        container.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الصور.</p>';
    }
}

async function uploadGalleryImage() {
    const fileInput = document.getElementById('gallery-image-file');
    const titleInput = document.getElementById('gallery-title');
    const statusEl = document.getElementById('gallery-upload-status');
    const userId = localStorage.getItem('userId');

    statusEl.textContent = '';
    const file = fileInput.files[0];
    if (!file) {
        statusEl.textContent = 'يرجى اختيار صورة أولاً.';
        return;
    }

    try {
        const imageData = await fileToBase64(file);
        const res = await fetch('/api/admin/gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ image: imageData, title: titleInput.value })
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم رفع الصورة بنجاح.';
            fileInput.value = '';
            titleInput.value = '';
            fetchAdminGallery();
        } else {
            statusEl.textContent = data.error || 'فشل رفع الصورة.';
        }
    } catch (err) {
        console.error('Upload failed', err);
        statusEl.textContent = 'حدث خطأ أثناء الرفع.';
    }
}

async function deleteGalleryImage(id) {
    const userId = localStorage.getItem('userId');
    if (!confirm('هل تريد حذف هذه الصورة؟')) return;
    try {
        const res = await fetch(`/api/admin/gallery/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (res.ok) {
            fetchAdminGallery();
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'فشل حذف الصورة.');
        }
    } catch (err) {
        console.error('Delete failed', err);
        alert('حدث خطأ أثناء الحذف.');
    }
}

// Moved to initDashboardEvents()

// Category management functions

async function loadCategories() {
    const container = document.getElementById('categories-container');
    const dropdown = document.getElementById('gallery-category');

    if (!container) return;

    container.innerHTML = '<p class="text-center text-gray-500">جاري تحميل الفئات...</p>';

    try {
        const res = await fetch('/api/categories');
        const data = await res.json();

        // Update categories container
        container.innerHTML = '';
        if (res.ok && data.categories && data.categories.length) {
            data.categories.forEach(category => {
                const categoryCard = document.createElement('div');
                categoryCard.className = 'bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center';
                categoryCard.innerHTML = `
                            <div>
                                <h4 class="font-semibold text-gray-800">${category.name}</h4>
                                ${category.description ? `<p class="text-sm text-gray-600">${category.description}</p>` : ''}
                            </div>
                            <div class="flex gap-2">
                                <button class="text-red-600 hover:text-red-800 text-sm" onclick="deleteCategory(${category.id})">
                                    <i class="fa-solid fa-trash"></i> حذف
                                </button>
                            </div>
                        `;
                container.appendChild(categoryCard);
            });
        } else {
            container.innerHTML = '<p class="text-center text-gray-500">لا توجد فئات بعد.</p>';
        }

        // Update dropdown
        if (dropdown) {
            dropdown.innerHTML = '<option value="">اختر فئة (اختياري)</option>';
            if (res.ok && data.categories && data.categories.length) {
                data.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    dropdown.appendChild(option);
                });
            }
        }
    } catch (e) {
        console.error('Failed to load categories', e);
        container.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الفئات.</p>';
    }
}

async function addCategory() {
    const nameInput = document.getElementById('category-name');
    const descInput = document.getElementById('category-description');
    const statusEl = document.getElementById('category-status');
    const userId = localStorage.getItem('userId');

    const name = nameInput.value.trim();
    if (!name) {
        statusEl.textContent = 'يرجى إدخال اسم الفئة.';
        statusEl.className = 'text-red-600 text-sm mt-2';
        return;
    }

    try {
        const res = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name: name,
                description: descInput.value.trim()
            })
        });

        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم إضافة الفئة بنجاح.';
            statusEl.className = 'text-green-600 text-sm mt-2';
            nameInput.value = '';
            descInput.value = '';
            loadCategories();
        } else {
            statusEl.textContent = data.error || 'فشل في إضافة الفئة.';
            statusEl.className = 'text-red-600 text-sm mt-2';
        }
    } catch (err) {
        console.error('Category operation failed', err);
        statusEl.textContent = 'حدث خطأ أثناء إضافة الفئة.';
        statusEl.className = 'text-red-600 text-sm mt-2';
    }
}

async function deleteCategory(id) {
    const userId = localStorage.getItem('userId');
    if (!confirm('هل تريد حذف هذه الفئة؟ سيتم إلغاء ربطها بجميع الصور المرتبطة بها.')) return;

    try {
        const res = await fetch(`/api/admin/categories/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await res.json();
        if (res.ok) {
            loadCategories();
        } else {
            alert(data.error || 'فشل حذف الفئة.');
        }
    } catch (err) {
        console.error('Delete failed', err);
        alert('حدث خطأ أثناء الحذف.');
    }
}

// Update gallery upload function to include category
async function uploadGalleryImage() {
    const fileInput = document.getElementById('gallery-image-file');
    const titleInput = document.getElementById('gallery-title');
    const categorySelect = document.getElementById('gallery-category');
    const statusEl = document.getElementById('gallery-upload-status');
    const userId = localStorage.getItem('userId');

    statusEl.textContent = '';
    const file = fileInput.files[0];
    if (!file) {
        statusEl.textContent = 'يرجى اختيار صورة أولاً.';
        return;
    }

    try {
        const imageData = await fileToBase64(file);
        const requestBody = {
            image: imageData,
            title: titleInput.value
        };

        // Add category if selected
        if (categorySelect && categorySelect.value) {
            requestBody.categoryId = parseInt(categorySelect.value);
        }

        const res = await fetch('/api/admin/gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(requestBody)
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم رفع الصورة بنجاح.';
            fileInput.value = '';
            titleInput.value = '';
            if (categorySelect) categorySelect.value = '';
            fetchAdminGallery();
        } else {
            statusEl.textContent = data.error || 'فشل رفع الصورة.';
        }
    } catch (err) {
        console.error('Upload failed', err);
        statusEl.textContent = 'حدث خطأ أثناء الرفع.';
    }
}

// Image editing functions
let currentEditingImageId = null;

async function openEditImageModal(imageId, title, categoryId) {
    currentEditingImageId = imageId;

    // Set current values
    document.getElementById('edit-image-title').value = title || '';

    // Load categories for dropdown
    const categorySelect = document.getElementById('edit-image-category');
    try {
        const res = await fetch('/api/categories');
        const data = await res.json();

        categorySelect.innerHTML = '<option value="">اختر فئة (اختياري)</option>';
        if (res.ok && data.categories && data.categories.length) {
            data.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                if (category.id == categoryId) {
                    option.selected = true;
                }
                categorySelect.appendChild(option);
            });
        }
    } catch (e) {
        console.error('Failed to load categories', e);
    }

    // Show modal
    document.getElementById('edit-image-modal').classList.remove('hidden');
    document.getElementById('edit-image-modal').classList.add('flex');
    document.getElementById('edit-image-status').textContent = '';
}

function closeEditImageModal() {
    document.getElementById('edit-image-modal').classList.add('hidden');
    document.getElementById('edit-image-modal').classList.remove('flex');
    currentEditingImageId = null;
}

async function saveImageChanges() {
    if (!currentEditingImageId) return;

    const title = document.getElementById('edit-image-title').value.trim();
    const categoryId = document.getElementById('edit-image-category').value || null;
    const statusEl = document.getElementById('edit-image-status');
    const userId = localStorage.getItem('userId');

    statusEl.textContent = 'جاري الحفظ...';
    statusEl.className = 'mt-3 text-sm text-center text-blue-600';

    try {
        const res = await fetch(`/api/admin/gallery/${currentEditingImageId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                title: title,
                category_id: categoryId
            })
        });

        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم حفظ التغييرات بنجاح!';
            statusEl.className = 'mt-3 text-sm text-center text-green-600';

            // Refresh gallery display
            fetchAdminGallery();

            // Close modal after a short delay
            setTimeout(() => {
                closeEditImageModal();
            }, 1500);
        } else {
            statusEl.textContent = data.error || 'فشل في حفظ التغييرات.';
            statusEl.className = 'mt-3 text-sm text-center text-red-600';
        }
    } catch (err) {
        console.error('Update failed', err);
        statusEl.textContent = 'حدث خطأ أثناء الحفظ.';
        statusEl.className = 'mt-3 text-sm text-center text-red-600';
    }
}

// Event listeners for category management
// Moved to initDashboardEvents()

// Sponsors functions
async function fetchAdminSponsors() {
    const container = document.getElementById('admin-sponsors-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-500">جاري تحميل الرعاة...</p>';
    try {
        const res = await fetch('/api/sponsors');
        const data = await res.json();
        container.innerHTML = '';
        if (res.ok && data.sponsors && data.sponsors.length) {
            data.sponsors.forEach(sponsor => {
                const card = document.createElement('div');
                card.className = 'bg-white p-3 rounded-xl shadow border border-gray-200';
                card.innerHTML = `
                            <img src="${sponsor.image_url || `https://placehold.co/200x100/3b82f6/ffffff?text=${sponsor.name.replace(/\s/g, '+')}`}" alt="${sponsor.name}" class="rounded-lg w-full h-40 object-cover mb-2" loading="lazy" decoding="async">
                            <div class="text-sm text-gray-700 text-center mb-2 font-semibold">${sponsor.name}</div>
                            <div class="text-center">
                                <button class="text-red-600 hover:text-red-800 font-bold text-sm" data-id="${sponsor.id}"><i class="fa-solid fa-trash ml-1"></i> حذف</button>
                            </div>
                        `;
                container.appendChild(card);
            });
            container.querySelectorAll('button[data-id]').forEach(btn => {
                btn.addEventListener('click', () => deleteSponsor(btn.dataset.id));
            });
        } else {
            container.innerHTML = '<p class="text-center text-gray-500">لا يوجد رعاة بعد.</p>';
        }
    } catch (e) {
        console.error('Failed to load sponsors', e);
        container.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل الرعاة.</p>';
    }
}

async function uploadSponsor() {
    const fileInput = document.getElementById('sponsor-image-file');
    const nameInput = document.getElementById('sponsor-name');
    const statusEl = document.getElementById('sponsor-upload-status');
    const userId = localStorage.getItem('userId');

    statusEl.textContent = '';
    const file = fileInput.files[0];
    const name = nameInput.value.trim();

    if (!file) {
        statusEl.textContent = 'يرجى اختيار صورة أولاً.';
        return;
    }

    if (!name) {
        statusEl.textContent = 'يرجى إدخال اسم الراعي.';
        return;
    }

    try {
        const imageData = await fileToBase64(file);
        const res = await fetch('/api/admin/sponsors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: name, image: imageData })
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم إضافة الراعي بنجاح.';
            fileInput.value = '';
            nameInput.value = '';
            fetchAdminSponsors();
        } else {
            statusEl.textContent = data.error || 'فشل إضافة الراعي.';
        }
    } catch (err) {
        console.error('Upload failed', err);
        statusEl.textContent = 'حدث خطأ أثناء الإضافة.';
    }
}

async function deleteSponsor(id) {
    // Store the sponsor ID for the confirmation modal
    window.pendingSponsorDeleteId = id;
    // Show the confirmation modal
    document.getElementById('delete-sponsor-modal').classList.remove('hidden');
}

// Function to open the delete sponsor modal
function openDeleteSponsorModal(id) {
    window.pendingSponsorDeleteId = id;
    document.getElementById('delete-sponsor-modal').classList.remove('hidden');
}

// Function to close the delete sponsor modal
function closeDeleteSponsorModal() {
    document.getElementById('delete-sponsor-modal').classList.add('hidden');
    window.pendingSponsorDeleteId = null;
}

// Function to actually delete the sponsor after confirmation
async function confirmDeleteSponsor() {
    const id = window.pendingSponsorDeleteId;
    if (!id) return;

    const userId = localStorage.getItem('userId');
    try {
        const res = await fetch(`/api/admin/sponsors/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (res.ok) {
            closeDeleteSponsorModal();
            fetchAdminSponsors();
            showMessageBox('نجح', 'تم حذف الراعي بنجاح.', 'success');
        } else {
            const data = await res.json().catch(() => ({}));
            showMessageBox('خطأ', data.error || 'فشل حذف الراعي.', 'error');
        }
    } catch (err) {
        console.error('Delete failed', err);
        showMessageBox('خطأ', 'حدث خطأ أثناء الحذف.', 'error');
    }
}

// Moved to initDashboardEvents()

// Giveaways functions
async function fetchAdminGiveaways() {
    const container = document.getElementById('admin-giveaways-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-gray-500">جاري تحميل المسابقات...</p>';
    try {
        const res = await fetch('/api/giveaways');
        const data = await res.json();
        container.innerHTML = '';
        if (res.ok && data.giveaways && data.giveaways.length) {
            data.giveaways.forEach(g => {
                const card = document.createElement('div');
                card.className = 'bg-white p-3 rounded-xl shadow border border-gray-200';
                const imageUrl = g.image_url || `https://placehold.co/400x300/f472b6/ffffff?text=${encodeURIComponent(g.name || 'مسابقة')}`;
                const deadlineText = g.deadline ? new Date(g.deadline).toLocaleString('ar-EG') : 'غير محدد';
                const isExpired = g.deadline ? (Date.now() > new Date(g.deadline).getTime()) : false;
                card.innerHTML = `
                            <img src="${imageUrl}" alt="${g.name || 'مسابقة'}" class="rounded-lg w-full h-40 object-cover mb-2" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f472b6/ffffff?text=${encodeURIComponent(g.name || 'مسابقة')}'">
                            <div class="text-sm text-gray-700 mb-2 font-semibold">${g.name}</div>
                            <div class="text-xs text-gray-600 mb-2">${g.description || ''}</div>
                            <div class="text-xs ${isExpired ? 'text-red-600' : 'text-gray-700'} mb-2"><i class="fa-regular fa-clock ml-1"></i> الموعد النهائي: ${deadlineText}</div>
                            <div class="text-xs text-gray-500"><i class="fa-solid fa-users ml-1"></i> عدد المشاركين: ${g.participants_count || 0}</div>
                            <div class="mt-3 flex gap-2">
                                <button class="bg-pink-600 hover:bg-pink-700 text-white text-xs px-3 py-2 rounded-lg" onclick='openEditGiveawayModal(${JSON.stringify({ id: g.id, name: g.name, description: g.description, deadline: g.deadline, image_url: g.image_url })})'>
                                    <i class="fa-solid fa-pen ml-1"></i> تعديل
                                </button>
                                <button class="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded-lg" onclick='openDeleteGiveawayModal(${g.id})'>
                                    <i class="fa-solid fa-trash ml-1"></i> حذف
                                </button>
                            </div>
                        `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<p class="text-center text-gray-500">لا توجد مسابقات بعد.</p>';
        }
    } catch (e) {
        console.error('Failed to load giveaways', e);
        container.innerHTML = '<p class="text-center text-red-500">حدث خطأ في تحميل المسابقات.</p>';
    }
}

// --- Edit Giveaway Modal ---
function openEditGiveawayModal(g) {
    const modal = document.getElementById('edit-giveaway-modal');
    document.getElementById('edit-giveaway-id').value = g.id;
    document.getElementById('edit-giveaway-name').value = g.name || '';
    document.getElementById('edit-giveaway-description').value = g.description || '';
    document.getElementById('edit-giveaway-deadline').value = g.deadline ? new Date(g.deadline).toISOString().slice(0, 16) : '';
    const preview = document.getElementById('edit-giveaway-image-preview');
    const imgUrl = g.image_url || `https://placehold.co/600x300/f472b6/ffffff?text=${encodeURIComponent(g.name || 'مسابقة')}`;
    if (preview) preview.src = imgUrl;
    document.getElementById('edit-giveaway-status').textContent = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
function closeEditGiveawayModal() {
    const modal = document.getElementById('edit-giveaway-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
async function saveGiveawayEdit() {
    const id = document.getElementById('edit-giveaway-id').value;
    const name = document.getElementById('edit-giveaway-name').value.trim();
    const description = document.getElementById('edit-giveaway-description').value.trim();
    const deadlineVal = document.getElementById('edit-giveaway-deadline').value;
    const fileInput = document.getElementById('edit-giveaway-image-file');
    const statusEl = document.getElementById('edit-giveaway-status');
    const userId = localStorage.getItem('userId');

    statusEl.textContent = '';
    let imageData = null;
    const file = fileInput.files && fileInput.files[0];
    if (file) {
        imageData = await fileToBase64(file);
    }
    const body = {
        name,
        description,
        deadline: deadlineVal ? new Date(deadlineVal).toISOString() : null,
    };
    if (imageData) body.image = imageData;

    try {
        const res = await fetch(`/api/admin/giveaways/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم تعديل المسابقة بنجاح.';
            closeEditGiveawayModal();
            fetchAdminGiveaways();
        } else {
            statusEl.textContent = data.error || 'فشل تعديل المسابقة.';
        }
    } catch (err) {
        console.error('Edit failed', err);
        statusEl.textContent = 'حدث خطأ أثناء التعديل.';
    }
}

// Delete Giveaway
function openDeleteGiveawayModal(id) {
    const modal = document.getElementById('delete-giveaway-modal');
    document.getElementById('delete-giveaway-id').value = id;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
function closeDeleteGiveawayModal() {
    const modal = document.getElementById('delete-giveaway-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
async function confirmDeleteGiveaway() {
    const id = document.getElementById('delete-giveaway-id').value;
    const userId = localStorage.getItem('userId');
    try {
        const res = await fetch(`/api/admin/giveaways/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (res.ok) {
            closeDeleteGiveawayModal();
            fetchAdminGiveaways();
            showMessageBox('نجح', 'تم حذف المسابقة بنجاح.', 'success');
        } else {
            const data = await res.json().catch(() => ({}));
            showMessageBox('خطأ', data.error || 'فشل حذف المسابقة.', 'error');
        }
    } catch (err) {
        console.error('Delete failed', err);
        showMessageBox('خطأ', 'حدث خطأ أثناء الحذف.', 'error');
    }
}

async function uploadAdminGiveaway() {
    const nameInput = document.getElementById('giveaway-admin-name');
    const descInput = document.getElementById('giveaway-admin-description');
    const deadlineInput = document.getElementById('giveaway-admin-deadline');
    const fileInput = document.getElementById('giveaway-admin-image-file');
    const statusEl = document.getElementById('giveaway-upload-status');
    const userId = localStorage.getItem('userId');

    statusEl.textContent = '';
    const name = nameInput.value.trim();
    const description = descInput.value.trim();
    const deadlineVal = deadlineInput.value;
    const file = fileInput.files && fileInput.files[0];

    if (!name) {
        statusEl.textContent = 'يرجى إدخال اسم المسابقة.';
        return;
    }
    if (!deadlineVal) {
        statusEl.textContent = 'يرجى تحديد الموعد النهائي للمسابقة.';
        return;
    }

    try {
        let imageData = null;
        if (file) {
            imageData = await fileToBase64(file);
        }
        const res = await fetch('/api/admin/giveaways', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description, image: imageData, deadline: new Date(deadlineVal).toISOString() })
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = 'تم إضافة المسابقة بنجاح.';
            nameInput.value = '';
            descInput.value = '';
            deadlineInput.value = '';
            if (fileInput) fileInput.value = '';
            fetchAdminGiveaways();
        } else {
            statusEl.textContent = data.error || 'فشل إضافة المسابقة.';
        }
    } catch (err) {
        console.error('Upload failed', err);
        statusEl.textContent = 'حدث خطأ أثناء الإضافة.';
    }
}

// Moved to initDashboardEvents()

// --- Fashion Shop Logic ---
async function fetchFashionProducts() {
    const container = document.getElementById('fashion-products-container');
    insertSkeletonCards('fashion-products-container', 4);

    try {
        const res = await fetch('/api/fashion/products');
        const data = await res.json();
        const products = data.products || [];

        if (products.length === 0) {
            container.innerHTML = '<p class="col-span-full text-center text-gray-500 py-12">لا يوجد منتجات حالياً.</p>';
            return;
        }

        container.innerHTML = products.map(p => `
                    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div class="h-48 bg-gray-100 relative">
                            <img src="${p.image_url || 'https://placehold.co/400x400/1e293b/white?text=No+Image'}" 
                                 alt="${p.name}" class="w-full h-full object-cover">
                            <span class="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded-lg text-xs font-bold text-green-700">${p.category}</span>
                        </div>
                        <div class="p-4">
                            <h5 class="font-bold text-gray-900 border-b pb-2 mb-2 line-clamp-1">${p.name}</h5>
                            <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-4">
                                <div><span class="block text-xs text-gray-400">السعر</span> ₪${p.price}</div>
                                <div><span class="block text-xs text-gray-400">المخزون</span> ${p.stock}</div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="openEditFashionModal(${JSON.stringify(p).replace(/"/g, '&quot;')})" 
                                        class="flex-1 bg-blue-50 text-blue-600 py-2 rounded-lg hover:bg-blue-100 font-bold transition-colors">تعديل</button>
                                <button onclick="handleDeleteFashion(${p.id})" 
                                        class="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition-colors"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `).join('');
    } catch (err) {
        console.error('Error fetching fashion products:', err);
        container.innerHTML = '<p class="col-span-full text-center text-red-500">فشل تحميل المنتجات.</p>';
    }
}

function openAddFashionModal() {
    document.getElementById('fashion-modal-title').textContent = 'إضافة منتج جديد';
    document.getElementById('fashion-form-id').value = '';
    document.getElementById('fashion-form-name').value = '';
    document.getElementById('fashion-form-price').value = '';
    document.getElementById('fashion-form-category').value = 'clothes';
    document.getElementById('fashion-form-stock').value = '0';
    document.getElementById('fashion-form-desc').value = '';
    document.getElementById('fashion-modal-image-preview').classList.add('hidden');
    document.getElementById('fashion-modal').classList.remove('hidden');
}

function openEditFashionModal(p) {
    document.getElementById('fashion-modal-title').textContent = 'تعديل المنتج';
    document.getElementById('fashion-form-id').value = p.id;
    document.getElementById('fashion-form-name').value = p.name;
    document.getElementById('fashion-form-price').value = p.price;
    document.getElementById('fashion-form-category').value = p.category;
    document.getElementById('fashion-form-stock').value = p.stock;
    document.getElementById('fashion-form-desc').value = p.description || '';

    const preview = document.getElementById('fashion-modal-image-preview');
    if (p.image_url) {
        preview.src = p.image_url;
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }

    document.getElementById('fashion-modal').classList.remove('hidden');
}

function closeFashionModal() {
    document.getElementById('fashion-modal').classList.add('hidden');
}

async function handleFashionSubmit() {
    const id = document.getElementById('fashion-form-id').value;
    const name = document.getElementById('fashion-form-name').value;
    const price = parseFloat(document.getElementById('fashion-form-price').value);
    const category = document.getElementById('fashion-form-category').value;
    const stock = parseInt(document.getElementById('fashion-form-stock').value);
    const description = document.getElementById('fashion-form-desc').value;
    const fileInput = document.getElementById('fashion-form-image');

    if (!name || isNaN(price) || !category) {
        alert('يرجى ملء جميع الحقول المطلوبة');
        return;
    }

    try {
        let imageData = null;
        if (fileInput.files.length > 0) {
            const reader = new FileReader();
            imageData = await new Promise(resolve => {
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(fileInput.files[0]);
            });
        }

        const url = id ? `/api/admin/fashion/products/${id}` : '/api/admin/fashion/products';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, price, category, stock, description, image: imageData })
        });

        if (res.ok) {
            closeFashionModal();
            fetchFashionProducts();
            showMessageBox('نجاح', id ? 'تم تحديث المنتج بنجاح' : 'تم إضافة المنتج بنجاح', 'success');
        } else {
            const error = await res.json();
            alert(error.error || 'فشل تنفيذ العملية');
        }
    } catch (err) {
        console.error('Fashion submit error:', err);
        alert('حدث خطأ فني');
    }
}

async function handleDeleteFashion(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    try {
        const res = await fetch(`/api/admin/fashion/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
            fetchFashionProducts();
            showMessageBox('تم الحذف', 'تم حذف المنتج بنجاح', 'success');
        } else {
            alert('فشل حذف المنتج');
        }
    } catch (err) {
        console.error('Delete fashion error:', err);
    }
}

// Removed standalone event listeners and moved to initDashboardEvents()

// Use global handleLogout from header.js for consistent CSRF-secure logout
