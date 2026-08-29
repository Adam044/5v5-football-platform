(function(){
'use strict';

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function arDate(d) {
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const dt = d instanceof Date ? d : new Date(d + 'T00:00:00');
  return `${days[dt.getDay()]}، ${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

function to12(t) {
  const [h,m] = t.split(':').map(Number);
  const suf = h >= 12 ? 'م' : 'ص';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2,'0')} ${suf}`;
}

async function api(method, path, body) {
  const res = await fetch('/api/field_admin' + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    window.location.href = '/field_admin/login.html';
    return { status: 401 };
  }
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function toast(msg, type='success') {
  const t = $('#toast');
  const msgEl = $('#toastMsg');
  if (msgEl) msgEl.innerText = msg;
  
  const icon = $('#toastIcon');
  if (icon) {
    if (type === 'success') icon.className = 'fa-solid fa-circle-check text-green-400 text-lg';
    else if (type === 'info') icon.className = 'fa-solid fa-circle-info text-blue-400 text-lg';
    else icon.className = 'fa-solid fa-circle-xmark text-red-400 text-lg';
  }
  
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2800);
}

function confirmDialog(title, msg) {
  return new Promise((resolve) => {
    app._confirmCb = resolve;
    $('#confirmTitle').innerText = title;
    $('#confirmMsg').innerText = msg;
    $('#confirm').classList.remove('hidden');
  });
}

const app = {
  view: 'today',
  date: fmtDate(new Date()),
  admin: null,
  slots: [],
  history: [],
  historyPage: 1,
  historyTotalPages: 1,
  filters: { status: '', payment_status: '', search: '', from: '', to: '' },
  _confirmCb: null,
  _bookingCtx: null,

  async init() {
    const me = await api('GET', '/me');
    if (me.status !== 200) { window.location.href = '/field_admin/login.html'; return; }
    this.admin = me.data.admin;
    
    $('#loader').classList.add('hidden');
    $('#app').classList.remove('hidden');

    this.updateBranding();
    
    // Onboarding Gate: If no operating hours or price, force setup
    if (!this.admin.operating_start || !this.admin.operating_end || !this.admin.price_per_hour) {
      this.setView('setup-required');
    } else {
      this.renderDateSlider();
      this.refreshSlots();
    }
    this.prefillSettings();
  },

  updateBranding() {
    const name = this.admin.field_name || 'Champions Arena';
    $('#header-title').innerText = name;
    $('#s-fieldName').value = name;
  },

  setView(v) {
    this.view = v;
    
    // Update Nav UI
    $$('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === v));
    
    // Hide all views
    ['today','calendar','history','settings','setup-required'].forEach(name => {
      const el = $('#view-' + name);
      if (el) el.classList.toggle('hidden', name !== v);
    });

    // Update Header Title based on view
    const titleMap = {
      'today': this.admin.field_name,
      'calendar': 'الجدول الأسبوعي',
      'history': 'سجل الحجوزات',
      'settings': 'الإعدادات',
      'setup-required': 'إعداد الملعب'
    };
    $('#header-title').innerText = titleMap[v] || this.admin.field_name;

    if (v === 'today') this.refreshSlots();
    if (v === 'calendar') this.renderWeekGrid();
    if (v === 'history') this.refreshHistory();
  },

  renderDateSlider() {
    const slider = $('#dateSlider');
    slider.innerHTML = '';
    const start = new Date(this.date + 'T00:00:00');
    start.setDate(start.getDate() - 2);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = fmtDate(d);
      const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short' });
      const dayNum = d.getDate();
      
      const pill = document.createElement('button');
      pill.className = `date-pill shrink-0 ${iso === this.date ? 'active' : ''}`;
      pill.onclick = () => this.setDate(iso);
      pill.innerHTML = `<span class="text-[10px] font-black uppercase opacity-60 mb-1">${dayName}</span><span class="text-xl font-black">${dayNum}</span>`;
      slider.appendChild(pill);
    }
  },

  setDate(d) {
    this.date = d;
    const dateText = arDate(d);
    
    // Safety check for elements before setting text
    const viewDateText = $('#view-date-text');
    if (viewDateText) viewDateText.innerText = dateText;
    
    this.renderDateSlider();
    this.refreshSlots();
  },

  shiftDate(n) {
    const d = new Date(this.date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    this.setDate(fmtDate(d));
  },

  preset(kind) {
    if (kind === 'today') this.setDate(fmtDate(new Date()));
  },

  async refreshSlots() {
    if (this.view !== 'today') return;
    const r = await api('GET', `/slots?date=${this.date}`);
    if (r.status === 200) {
      this.slots = r.data.slots || [];
      
      // Auto-generate if empty and today/future
      if (this.slots.length === 0) {
        const today = fmtDate(new Date());
        if (this.date >= today && this.admin.operating_start && this.admin.operating_end) {
          await this.generateSlots(false); // silent generate
          return; // generateSlots calls refreshSlots again
        }
      }
      
      this.renderTimeline();
      this.updateStats();
    }
  },

  async updateStats() {
    const r = await api('GET', `/stats/summary?range=today&date=${this.date}`);
    if (r.status !== 200) return;
    const { slots, bookings } = r.data;
    $('#s-bookings').innerText = bookings.total_bookings;
    $('#s-hours').innerText = `${Math.round(slots.booked_minutes / 60)}h`;
    $('#s-revenue').innerText = `${Math.round(bookings.total_revenue)} ₪`;
  },

  renderTimeline() {
    const container = $('#timelineContainer');
    if (this.slots.length === 0) {
      container.innerHTML = `
        <div class="py-16 text-center">
          <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200"><i class="fa-solid fa-calendar-xmark text-2xl"></i></div>
          <p class="font-black text-slate-400">لا توجد مواعيد لهذا اليوم</p>
          <p class="text-[10px] font-bold text-slate-300 mt-2">تأكد من ضبط أوقات العمل في الإعدادات</p>
        </div>`;
      return;
    }

    container.innerHTML = this.slots.map(s => {
      let isPast = false;
      const endT = s.end_time;
      if (endT === '00:00') {
        // If it ends at midnight, check if we are already in the next day
        const tomorrow = new Date(s.slot_date + 'T00:00:00');
        tomorrow.setDate(tomorrow.getDate() + 1);
        isPast = tomorrow < new Date();
      } else {
        isPast = new Date(s.slot_date + 'T' + endT) < new Date();
      }

      const booked = s.is_booked === 1 && s.booking_status === 'confirmed';
      const paid = s.payment_status === 'paid';
      
      let cardClass = 'bg-white border-slate-100';
      let statusText = 'متاح';
      let icon = '<i class="fa-solid fa-plus text-blue-600/30"></i>';
      let colorClass = 'text-blue-600';
      let dotColor = '#f1f5f9';
      
      if (isPast) {
        cardClass = 'bg-slate-50/50 opacity-60 border-transparent shadow-none';
        statusText = 'انتهى';
        icon = '';
        colorClass = 'text-slate-400';
        dotColor = '#cbd5e1';
      } else if (booked) {
        if (paid) {
          cardClass = 'bg-blue-50/50 border-blue-100 shadow-sm shadow-blue-600/5';
          colorClass = 'text-blue-700';
          dotColor = '#2563eb';
          icon = '<i class="fa-solid fa-circle-check text-blue-600"></i>';
        } else {
          cardClass = 'bg-amber-50/50 border-amber-100 shadow-sm shadow-amber-600/5';
          colorClass = 'text-amber-700';
          dotColor = '#f59e0b';
          icon = '<i class="fa-solid fa-circle-exclamation text-amber-500"></i>';
        }
      } else {
        cardClass = 'bg-white border-slate-100 hover:border-blue-200 hover:bg-blue-50/10';
        dotColor = '#f1f5f9';
      }

      return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background: ${dotColor}"></div>
          <div class="flex items-center gap-4 py-3">
            <div class="w-14 text-[10px] font-black text-slate-400 text-left">
              ${s.start_time.substring(0,5)}
            </div>
            <div onclick="app.onSlotClick('${s.id}')" class="flex-1 slot-card glass-card p-5 flex items-center justify-between cursor-pointer ${cardClass}">
              <div>
                <p class="text-sm font-black ${colorClass} tracking-tight mb-0.5">${booked ? s.customer_name : statusText}</p>
                <p class="text-[10px] font-bold text-slate-400">${to12(s.start_time)} – ${to12(s.end_time)}</p>
              </div>
              <div class="flex items-center gap-4">
                ${booked ? `
                  <div class="text-left">
                    <p class="font-black text-slate-900">${Math.round(s.amount)} ₪</p>
                    <p class="text-[9px] font-black uppercase tracking-widest ${paid ? 'text-blue-700' : 'text-amber-600'}">${paid ? 'مدفوع' : 'غير مدفوع'}</p>
                  </div>
                ` : ''}
                ${icon}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  onSlotClick(id) {
    const s = this.slots.find(x => x.id === id);
    if (!s) return;
    if (s.is_booked === 1 && s.booking_status === 'confirmed') this.openEditBooking(s);
    else this.openCreateBooking(s);
  },

  onWeekSlotClick(s) {
    if (s.is_booked === 1 && s.booking_status === 'confirmed') {
      this.openEditBooking(s);
    } else {
      toast('هذا الموعد متاح وغير محجوز بعد', 'info');
    }
  },

  openCreateBooking(s) {
    this._bookingCtx = { mode: 'create', date: s.slot_date, start_time: s.start_time, duration: s.duration_minutes };
    $('#bs-title').innerText = 'حجز جديد';
    $('#bs-time').innerText = `${to12(s.start_time)} – ${to12(s.end_time)}`;
    $('#bs-name').value = '';
    $('#bs-phone').value = '';
    $('#bs-price').value = Math.round(this.admin.price_per_hour * (s.duration_minutes / 60));
    $('#bs-pay').value = 'unpaid';
    
    $('#bookingForm').classList.remove('hidden');
    $('#bookingDetails').classList.add('hidden');
    this.toggleSheet(true);
  },

  openEditBooking(s) {
    this._bookingCtx = { mode: 'edit', slot: s, bookingId: s.booking_id };
    $('#bs-title').innerText = 'تفاصيل الحجز';
    $('#bs-time').innerText = `${to12(s.start_time)} – ${to12(s.end_time)}`;
    
    // Populate Details View
    $('#bd-name').innerText = s.customer_name;
    $('#bd-phone').innerText = s.customer_phone || 'لا يوجد رقم';
    $('#bd-amount').innerText = Math.round(s.amount);
    
    // Add notes if they exist in the slot object
    const notesEl = $('#bd-notes');
    if (notesEl) {
        notesEl.innerText = s.notes || 'لا توجد ملاحظات';
    }
    
    const statusEl = $('#bd-status');
    if (s.payment_status === 'paid') {
      statusEl.innerText = 'مدفوع';
      statusEl.className = 'inline-flex px-3 py-1 rounded-lg font-black text-xs mt-1 bg-blue-100 text-blue-700';
    } else {
      statusEl.innerText = 'غير مدفوع';
      statusEl.className = 'inline-flex px-3 py-1 rounded-lg font-black text-xs mt-1 bg-amber-100 text-amber-700';
    }

    const wa = $('#bd-whatsapp');
    const call = $('#bd-call');
    if (s.customer_phone) {
      const cleanPhone = s.customer_phone.replace(/\D/g, '');
      wa.href = `https://wa.me/${cleanPhone}`;
      call.href = `tel:${cleanPhone}`;
      wa.parentElement.classList.remove('hidden');
    } else {
      wa.parentElement.classList.add('hidden');
    }

    const markPaidBtn = $('#bd-mark-paid');
    if (markPaidBtn) {
      markPaidBtn.classList.toggle('hidden', s.payment_status === 'paid');
    }

    $('#bookingForm').classList.add('hidden');
    $('#bookingDetails').classList.remove('hidden');
    this.toggleSheet(true);
  },

  toggleSheet(show) {
    $('#bookingSheet').classList.toggle('active', show);
    $('#overlay').classList.toggle('active', show);
  },

  closeBooking() { this.toggleSheet(false); },

  async cancelBooking() {
    const ok = await confirmDialog('إلغاء الحجز', 'هل تريد إلغاء هذا الحجز؟');
    if (!ok) return;
    const r = await api('PUT', `/bookings/${this._bookingCtx.bookingId}`, { status: 'cancelled' });
    if (r.status === 200) { toast('تم إلغاء الحجز'); this.closeBooking(); this.refreshSlots(); }
  },

  async markAsPaid() {
    const r = await api('PUT', `/bookings/${this._bookingCtx.bookingId}`, { payment_status: 'paid' });
    if (r.status === 200) {
      toast('تم تأكيد الدفع بنجاح');
      this.closeBooking();
      this.refreshSlots();
    } else {
      toast('فشل تحديث حالة الدفع', 'error');
    }
  },

  async saveSettings() {
    const body = {
      full_name: $('#s-fieldName').value,
      price_per_hour: $('#s-price').value,
      default_slot_duration: $('#s-dur').value,
      phone: $('#s-phone').value,
      operating_start: $('#s-start').value,
      operating_end: $('#s-end').value
    };
    const r = await api('PUT', '/settings', body);
    if (r.status === 200) {
      toast('تم حفظ الإعدادات');
      this.admin = { ...this.admin, ...body };
      this.updateBranding();
      this.refreshSlots();
    }
  },

  async generateSlots(showToast = true) {
    const r = await api('POST', '/slots/generate', { start_date: this.date, end_date: this.date });
    if (r.status === 200) { 
      if (showToast) toast('تم إنشاء المواعيد'); 
      this.refreshSlots(); 
    }
  },

  logout: async () => {
    const ok = await confirmDialog('تسجيل الخروج', 'هل تريد الخروج من لوحة التحكم؟');
    if (!ok) return;
    await api('POST', '/logout');
    window.location.href = '/field_admin/login.html';
  },

  closeConfirm(res) {
    $('#confirm').classList.add('hidden');
    if (this._confirmCb) this._confirmCb(res);
  },

  openCalendarPicker() { $('#calendarModal').classList.remove('hidden'); $('#jumpDate').value = this.date; },
  closeCalendarPicker() { $('#calendarModal').classList.add('hidden'); },
  jumpToDate() { const d = $('#jumpDate').value; if (d) { this.setDate(d); this.closeCalendarPicker(); } },

  shiftWeek(n) {
    const d = new Date(this.date + 'T00:00:00');
    d.setDate(d.getDate() + (n * 7));
    this.setDate(fmtDate(d));
    if (this.view === 'calendar') this.renderWeekGrid();
  },

  async renderWeekGrid() {
    const head = $('#weekHead');
    const body = $('#weekBody');
    head.innerHTML = '<tr><th class="px-4 py-4 border-b border-slate-100">الوقت</th></tr>';
    body.innerHTML = '';

    const startOfWeek = new Date(this.date + 'T00:00:00');
    const day = startOfWeek.getDay(); // 0 is Sunday
    startOfWeek.setDate(startOfWeek.getDate() - day); // Start from Sunday

    const days = [];
    const dayHeaders = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const iso = fmtDate(d);
      days.push(iso);
      const th = document.createElement('th');
      th.className = `px-4 py-4 border-b border-slate-100 ${iso === fmtDate(new Date()) ? 'text-blue-600' : ''}`;
      th.innerHTML = `<div>${dayHeaders[i]}</div><div class="text-[9px] opacity-60">${d.getDate()}/${d.getMonth()+1}</div>`;
      head.firstChild.appendChild(th);
    }

    // Fetch all slots for the week
    const r = await api('GET', `/slots?start_date=${days[0]}&end_date=${days[6]}`);
    if (r.status !== 200) return;
    const allSlots = r.data.slots || [];

    // Group by time
    const timeMap = {};
    allSlots.forEach(s => {
      if (!timeMap[s.start_time]) timeMap[s.start_time] = {};
      timeMap[s.start_time][s.slot_date] = s;
    });

    const times = Object.keys(timeMap).sort();
    times.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="px-4 py-3 text-[10px] font-black text-slate-400 bg-slate-50/30">${t.substring(0,5)}</td>`;
      days.forEach(d => {
        const s = timeMap[t][d];
        const td = document.createElement('td');
        td.className = 'p-1 border-r border-slate-50';
        if (s) {
          const booked = s.is_booked === 1 && s.booking_status === 'confirmed';
          const isPast = new Date(s.slot_date + 'T' + s.end_time) < new Date();
          let dotColor = 'bg-slate-100';
          if (booked) {
            dotColor = s.payment_status === 'paid' ? 'bg-blue-600' : 'bg-amber-500';
            dotColor += ' shadow-[0_0_8px_rgba(37,99,235,0.3)]';
          } else if (isPast) dotColor = 'bg-slate-200 opacity-40';
          
          td.innerHTML = `<button onclick='app.onWeekSlotClick(${JSON.stringify(s).replace(/'/g, "&apos;")})' class="w-full h-8 rounded-lg ${dotColor} transition-transform active:scale-90"></button>`;
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  },

  async refreshHistory() {
    const r = await api('GET', `/bookings?page=${this.historyPage}&per_page=15`);
    const tbody = $('#historyBody');
    if (r.status !== 200) { tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400">فشل تحميل السجل</td></tr>'; return; }
    
    const { bookings, pagination } = r.data;
    this.historyTotalPages = pagination.total_pages;

    if (bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-slate-400 font-bold">لا توجد حجوزات سابقة</td></tr>';
      return;
    }

    tbody.innerHTML = bookings.map(b => `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-6 py-4 text-right">
          <p class="font-black text-slate-800">${b.customer_name}</p>
          <p class="text-[10px] text-slate-400">${b.customer_phone || 'بدون هاتف'}</p>
        </td>
        <td class="px-6 py-4 text-right">
          <p class="text-xs font-bold text-slate-600">${arDate(b.slot_date).split('،')[1]}</p>
          <p class="text-[10px] text-slate-400">${to12(b.start_time)}</p>
        </td>
        <td class="px-6 py-4 font-black text-slate-800 text-right">${Math.round(b.amount)} ₪</td>
        <td class="px-6 py-4 text-center">
          <span class="px-2 py-1 rounded-md text-[10px] font-black ${b.payment_status === 'paid' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}">
            ${b.payment_status === 'paid' ? 'مدفوع' : 'غير مدفوع'}
          </span>
        </td>
      </tr>
    `).join('');

    this.renderPagination(pagination);
  },

  renderPagination(p) {
    const el = $('#historyPages');
    el.innerHTML = `
      <span class="text-[10px] font-black text-slate-400 uppercase">صفحة ${p.page} من ${p.total_pages}</span>
      <div class="flex gap-2">
        <button onclick="app.changePage(-1)" ${p.page <= 1 ? 'disabled' : ''} class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center disabled:opacity-30"><i class="fa-solid fa-chevron-right text-xs"></i></button>
        <button onclick="app.changePage(1)" ${p.page >= p.total_pages ? 'disabled' : ''} class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center disabled:opacity-30"><i class="fa-solid fa-chevron-left text-xs"></i></button>
      </div>
    `;
  },

  changePage(n) {
    this.historyPage = Math.max(1, Math.min(this.historyTotalPages, this.historyPage + n));
    this.refreshHistory();
  },

  prefillSettings() {
    $('#s-price').value = this.admin.price_per_hour;
    $('#s-dur').value = this.admin.default_slot_duration;
    $('#s-phone').value = this.admin.phone || '';
    $('#s-start').value = this.admin.operating_start;
    $('#s-end').value = this.admin.operating_end;
  },

  async changePassword() {
    const cur = $('#pw-cur').value, p1 = $('#pw-new').value;
    if (!cur || !p1) { toast('يرجى ملء الحقول', 'error'); return; }
    const r = await api('PUT', '/change-password', { current_password: cur, new_password: p1 });
    if (r.status === 200) { toast('تم التغيير بنجاح'); $('#pw-cur').value = ''; $('#pw-new').value = ''; }
    else toast(r.data?.error || 'فشل التغيير', 'error');
  },

  async exportCsv() {
    toast('جارٍ التصدير...', 'info');
    const r = await api('GET', '/bookings?per_page=1000');
    if (r.status !== 200) return;
    const csv = 'Date,Time,Customer,Phone,Amount,Status\n' + r.data.bookings.map(b => 
      `${b.slot_date},${b.start_time},"${b.customer_name}",${b.customer_phone},${b.amount},${b.payment_status}`
    ).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bookings_${this.admin.field_name}.csv`;
    a.click();
  }
};

$('#bookingForm').onsubmit = async (e) => {
  e.preventDefault();
  const ctx = app._bookingCtx;
  const body = {
    customer_name: $('#bs-name').value,
    customer_phone: $('#bs-phone').value,
    amount: $('#bs-price').value,
    payment_status: $('#bs-pay').value,
    duration_minutes: ctx.duration,
    status: 'confirmed'
  };

  let r;
  if (ctx.mode === 'create') {
    r = await api('POST', '/bookings', { 
      ...body, 
      slot_date: ctx.date, 
      start_time: ctx.start_time 
    });
  } else {
    r = await api('PUT', `/bookings/${ctx.bookingId}`, body);
  }

  if (r.status === 200) {
    toast('تم الحفظ بنجاح');
    app.closeBooking();
    app.refreshSlots();
  } else {
    toast(r.data?.error || 'حدث خطأ ما', 'error');
  }
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
})();
