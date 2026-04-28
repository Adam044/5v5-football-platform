let selectedSubscription = null;
let allActivePlayers = [];

async function initCoachDashboard() {
    try {
        const response = await fetch('/api/me', { credentials: 'include' });
        if (!response.ok) {
            window.location.href = '/auth';
            return;
        }
        const meData = await response.json();
        const user = meData.user;
        if (!user || (user.role !== 'coach' && !user.is_admin)) {
            alert('عذراً، هذه الصفحة مخصصة للمدربين فقط');
            window.location.href = '/';
            return;
        }
        document.getElementById('coach-name').textContent = `المدرب: ${user.name}`;
        
        // Load initial data
        await fetchTrainingData();
        fetchCoachActivity();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/auth';
    }
}

async function fetchTrainingData() {
    try {
        const response = await fetch('/api/admin/trainings', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch trainings');
        
        const data = await response.json();
        allActivePlayers = data.subscriptions.filter(s => s.status === 'active');
        renderPlayersList(allActivePlayers);
    } catch (error) {
        console.error('Fetch training data failed:', error);
        document.getElementById('active-players-list').innerHTML = `
            <div class="col-span-full py-12 text-center text-red-500 font-bold">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i>
                <p>فشل تحميل قائمة اللاعبين</p>
            </div>
        `;
    }
}

function renderPlayersList(players) {
    const container = document.getElementById('active-players-list');
    if (!players || players.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-400 font-bold">
                <i class="fa-solid fa-users-slash text-2xl mb-2"></i>
                <p>لا يوجد لاعبين مشتركين حالياً</p>
            </div>
        `;
        return;
    }

    container.innerHTML = players.map(p => {
        const initials = p.user_name.split(' ').map(n => n[0]).join('').toUpperCase();
        const percent = (p.credits / 8) * 100;
        
        return `
            <div onclick="openBadgeModal(${p.user_id})" 
                class="p-4 bg-white border border-slate-100 rounded-3xl hover:border-orange-500 hover:shadow-xl cursor-pointer transition-all flex items-center justify-between group">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 font-black group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                        ${initials}
                    </div>
                    <div>
                        <div class="font-black text-slate-800 group-hover:text-orange-600 transition-colors">${p.user_name}</div>
                        <div class="text-[10px] text-slate-400 font-bold">${p.phone_number || 'بدون هاتف'}</div>
                    </div>
                </div>
                <div class="text-left">
                    <div class="text-xs font-black text-slate-800">${p.credits}/8</div>
                    <div class="w-12 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div class="h-full bg-orange-500" style="width: ${percent}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterPlayersList(query) {
    if (!query) {
        renderPlayersList(allActivePlayers);
        return;
    }
    
    const filtered = allActivePlayers.filter(p => 
        p.user_name.toLowerCase().includes(query.toLowerCase()) || 
        (p.phone_number && p.phone_number.includes(query))
    );
    renderPlayersList(filtered);
}

async function openBadgeModal(playerId) {
    try {
        const response = await fetch(`/api/admin/trainings/player/${playerId}`, { credentials: 'include' });
        if (!response.ok) {
            const err = await response.json();
            alert(err.error || 'هذا اللاعب ليس لديه اشتراك نشط حالياً');
            return;
        }
        
        const data = await response.json();
        const sub = data.subscription;
        selectedSubscription = sub;
        
        // Update UI
        document.getElementById('card-name').textContent = sub.user_name;
        document.getElementById('card-phone').textContent = sub.phone_number || 'بدون هاتف';
        document.getElementById('card-initials').textContent = sub.user_name.split(' ').map(n => n[0]).join('').toUpperCase();
        document.getElementById('card-credits').textContent = `${sub.credits}/8`;
        document.getElementById('card-status').textContent = sub.status === 'active' ? 'نشط' : 'غير نشط';
        
        const percent = (sub.credits / 8) * 100;
        document.getElementById('card-percent').textContent = `${Math.round(percent)}%`;
        document.getElementById('card-energy-fill').style.width = `${percent}%`;

        // Show Modal
        const modal = document.getElementById('player-badge-modal');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

    } catch (error) {
        console.error('Load card failed:', error);
        alert('حدث خطأ أثناء تحميل بيانات اللاعب');
    }
}

function closeBadgeModal() {
    const modal = document.getElementById('player-badge-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    selectedSubscription = null;
}

async function deductCredit() {
    if (!selectedSubscription) return;

    if (!confirm(`هل أنت متأكد من تسجيل حضور ${selectedSubscription.user_name}؟ سيتم خصم جلسة واحدة.`)) {
        return;
    }

    try {
        const response = await fetch('/api/admin/trainings/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscriptionId: selectedSubscription.id }),
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            
            // Reload data
            await fetchTrainingData();
            fetchCoachActivity();
            
            // Refresh modal if it's still open
            if (selectedSubscription) {
                openBadgeModal(selectedSubscription.user_id);
            }
            
            alert(`تم تسجيل الحضور بنجاح. الرصيد المتبقي: ${data.remainingCredits}`);
        } else {
            const err = await response.json();
            alert(`فشل التسجيل: ${err.error}`);
        }
    } catch (error) {
        console.error('Deduct failed:', error);
        alert('حدث خطأ في الاتصال بالخادم');
    }
}

async function fetchCoachActivity() {
    try {
        const response = await fetch('/api/admin/trainings', { credentials: 'include' });
        const data = await response.json();
        
        const container = document.getElementById('coach-recent-activity');
        if (!data.attendance || data.attendance.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-400 font-bold py-8">لا يوجد نشاط مؤخراً</p>';
            return;
        }

        container.innerHTML = data.attendance.slice(0, 10).map(log => `
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <div>
                        <div class="font-black text-slate-800 text-sm">${log.user_name}</div>
                        <div class="text-[10px] font-bold text-slate-400">${new Date(log.attended_at).toLocaleString('he-IL')}</div>
                    </div>
                </div>
                <div class="text-left">
                    <span class="text-[9px] font-black text-slate-400 uppercase">المدرب: ${log.coach_name || 'مدير'}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Fetch activity failed:', error);
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/auth';
    } catch (error) {
        console.error('Logout failed:', error);
        window.location.href = '/auth';
    }
}

window.onload = initCoachDashboard;
