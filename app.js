// ==========================================================================
// Gemini Share Hub — Client Application Logic (PHP + SQLite Server Edition)
// Features: Direct Server Storage via api.php (Shared across all users)
// Primary Focus: Individual Posts (Offers & Requests)
// Secondary: Group Pooling (5 Members Cost Sharing) with Admin Management
// Master PIN: 1123355
// ==========================================================================

const API_ENDPOINT = 'api.php';

// Global State
const state = {
  view: 'offers', // 'offers' (default!) | 'requests' | 'all' | 'groups'
  postCost: 'all', // 'all' | 'free' | 'paid'
  groupFilter: 'all', // 'all' | 'discount' | 'open'
  search: '',
  posts: [],
  groups: [],
  adminGroupId: null,
  adminPin: ''
};

// DOM Elements: Navigation Tabs
const tabOffersBtn = document.getElementById('tabOffersBtn');
const tabRequestsBtn = document.getElementById('tabRequestsBtn');
const tabAllBtn = document.getElementById('tabAllBtn');
const tabGroupsBtn = document.getElementById('tabGroupsBtn');
const switchTabs = [tabOffersBtn, tabRequestsBtn, tabAllBtn, tabGroupsBtn];

// DOM Elements: Filter Toolbars
const postsCostFilters = document.getElementById('postsCostFilters');
const groupsFilters = document.getElementById('groupsFilters');
const searchInput = document.getElementById('searchInput');
const itemsGrid = document.getElementById('itemsGrid');
const toastContainer = document.getElementById('toastContainer');

// Stats Elements
const offersCountEl = document.getElementById('offersCount');
const requestsCountEl = document.getElementById('requestsCount');
const groupsCountEl = document.getElementById('groupsCount');

// Modals
const newPostModal = document.getElementById('newPostModal');
const newGroupModal = document.getElementById('newGroupModal');
const joinGroupModal = document.getElementById('joinGroupModal');
const groupAdminModal = document.getElementById('groupAdminModal');
const deletePostModal = document.getElementById('deletePostModal');
const faqModal = document.getElementById('faqModal');

// Action Buttons
const openNewPostBtn = document.getElementById('openNewPostBtn');
const openNewGroupBtn = document.getElementById('openNewGroupBtn');
const openFaqBtn = document.getElementById('openFaqBtn');

// Forms
const newPostForm = document.getElementById('newPostForm');
const newGroupForm = document.getElementById('newGroupForm');
const joinGroupForm = document.getElementById('joinGroupForm');
const adminPinForm = document.getElementById('adminPinForm');
const deletePostForm = document.getElementById('deletePostForm');

// Dynamic form controls in New Group Modal
const groupHasDiscount = document.getElementById('groupHasDiscount');
const discountDetailsBox = document.getElementById('discountDetailsBox');
if (groupHasDiscount && discountDetailsBox) {
  groupHasDiscount.addEventListener('change', () => {
    discountDetailsBox.style.display = groupHasDiscount.checked ? 'block' : 'none';
    const labelInput = document.getElementById('groupDiscountLabel');
    if (groupHasDiscount.checked && labelInput && !labelInput.value.trim()) {
      labelInput.value = 'הנחת סטודנט (מחיר מוזל)';
    }
  });
}

const groupPrepayRequired = document.getElementById('groupPrepayRequired');
const prepayDetailsBox = document.getElementById('prepayDetailsBox');
if (groupPrepayRequired && prepayDetailsBox) {
  groupPrepayRequired.addEventListener('change', () => {
    prepayDetailsBox.style.display = groupPrepayRequired.checked ? 'block' : 'none';
  });
}

/**
 * Toast notifications
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Safe HTML escaping
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Relative date formatter
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffDay > 0) {
      if (diffDay === 1) return 'אתמול';
      if (diffDay < 7) return `לפני ${diffDay} ימים`;
      return d.toLocaleDateString('he-IL');
    }
    if (diffHr > 0) return `לפני ${diffHr} שעות`;
    if (diffMin > 0) return `לפני ${diffMin} דקות`;
    return 'עכשיו';
  } catch {
    return dateStr;
  }
}

/**
 * Unified API Request Helper
 */
async function apiCall(action, options = {}) {
  const method = options.method || 'GET';
  let url = `${API_ENDPOINT}?action=${encodeURIComponent(action)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const fetchOpts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal
  };

  if (method === 'GET' && options.params) {
    const q = new URLSearchParams(options.params).toString();
    if (q) url += '&' + q;
  } else if (method === 'POST' && options.body) {
    fetchOpts.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      throw new Error('השרת לא מגיב (Timeout). נא לבדוק הרשאות כתיבה לתיקיית data.');
    }
    throw new Error('שגיאת תקשורת עם השרת');
  } finally {
    clearTimeout(timeoutId);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('שגיאת תקשורת עם השרת: התקבלה תשובה לא תקינה');
  }

  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'אירעה שגיאה בביצוע הפעולה');
  }
  return data;
}

/**
 * Load Stats
 */
async function loadStats() {
  try {
    const data = await apiCall('stats');
    if (data.success && data.stats) {
      if (offersCountEl) offersCountEl.textContent = data.stats.offers;
      if (requestsCountEl) requestsCountEl.textContent = data.stats.requests;
      if (groupsCountEl) groupsCountEl.textContent = data.stats.groups;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

/**
 * Load and Render Content based on current view
 */
async function loadContent() {
  if (state.view === 'groups') {
    await loadGroups();
  } else {
    await loadPosts();
  }
}

/**
 * Fetch Posts (Offers, Requests, All)
 */
async function loadPosts() {
  const filters = {
    type: state.view === 'offers' ? 'offer' : (state.view === 'requests' ? 'request' : 'all'),
    cost_type: state.postCost,
    search: state.search
  };

  try {
    const data = await apiCall('posts', { params: filters });
    state.posts = data.posts || [];
    renderPosts(state.posts);
  } catch (err) {
    showToast(err.message || 'שגיאה בטעינת המודעות', 'error');
  }
}

/**
 * Render Posts Grid
 */
function renderPosts(posts) {
  if (!posts || posts.length === 0) {
    itemsGrid.innerHTML = `
      <div class="empty-state glass-card">
        <div class="empty-icon">🔍</div>
        <h3>לא נמצאו מודעות מתאימות</h3>
        <p>נסה לשנות את הסינון או החיפוש, או היה הראשון לפרסם מודעה!</p>
        <button class="btn btn-primary" onclick="openModal(newPostModal)">
          ➕ פרסם מודעה ראשונה
        </button>
      </div>
    `;
    return;
  }

  itemsGrid.innerHTML = posts.map(post => {
    const isOffer = post.type === 'offer';
    const typeLabel = isOffer ? '🌟 מציע מנוי' : '🔍 מחפש להצטרף';
    const typeBadgeClass = isOffer ? 'badge-offer' : 'badge-request';
    const costLabel = post.cost_type === 'free' ? '🎁 חינם' : '💳 חלוקת עלויות';
    const costBadgeClass = post.cost_type === 'free' ? 'badge-free' : 'badge-paid';
    const initial = (post.name && post.name.trim()) ? post.name.trim()[0].toUpperCase() : (isOffer ? 'מ' : 'ח');
    const displayName = post.name && post.name.trim() ? escapeHtml(post.name.trim()) : (isOffer ? 'מציע מנוי' : 'מחפש להצטרף');
    const dateFormatted = formatDate(post.created_at);

    return `
      <article class="post-card glass-panel ${post.type}" data-id="${post.id}">
        <div class="card-header">
          <div class="badge-group">
            <span class="badge ${typeBadgeClass}">${typeLabel}</span>
            <span class="badge ${costBadgeClass}">${costLabel}</span>
            ${post.forum_user ? `
              <span class="badge badge-forum" title="משתמש בפורום מתמחים/בינה טופ">
                👤 מתמחים/בינה טופ: <strong>@${escapeHtml(post.forum_user)}</strong>
              </span>
            ` : ''}
          </div>
          <span class="post-date">${dateFormatted}</span>
        </div>

        <div class="user-info">
          <div class="user-avatar">${initial}</div>
          <div class="user-details">
            <h3>${displayName}</h3>
            <span>Google Family</span>
          </div>
        </div>

        ${post.notes ? `<div class="notes-box">${escapeHtml(post.notes)}</div>` : ''}

        <div class="contact-actions">
          <div class="email-box">
            <span class="email-address">${escapeHtml(post.email)}</span>
            <button class="btn-icon btn-copy" onclick="copyEmail('${escapeHtml(post.email)}', this)" title="העתק אימייל">
              <span>📋</span>
              <span>העתק</span>
            </button>
          </div>

          <a href="mailto:${encodeURIComponent(post.email)}?subject=${encodeURIComponent('פנייה מ-Gemini Share Hub')}" class="btn btn-outline" style="width: 100%; margin-top: 0.35rem;" target="_blank">
            <span>✉️</span>
            <span>שלח אימייל ישיר</span>
          </a>
        </div>

        <div class="card-footer">
          <span style="color: var(--text-muted); font-size: 0.75rem;">מודעה #${post.id}</span>
          <button class="btn-delete-link" onclick="openDeletePostModal(${post.id})">
            <span>🗑️</span>
            <span>הסר מודעה</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Fetch Groups
 */
async function loadGroups() {
  const filters = {
    has_discount: state.groupFilter === 'discount' ? 'true' : 'false',
    status: state.groupFilter === 'open' ? 'open' : 'all',
    search: state.search
  };

  try {
    const data = await apiCall('groups', { params: filters });
    state.groups = data.groups || [];
    renderGroups(state.groups);
  } catch (err) {
    showToast(err.message || 'שגיאה בטעינת הקבוצות', 'error');
  }
}

/**
 * Render Groups Grid
 */
function renderGroups(groups) {
  if (!groups || groups.length === 0) {
    itemsGrid.innerHTML = `
      <div class="empty-state glass-card">
        <div class="empty-icon">👥</div>
        <h3>לא נמצאו קבוצות שיתוף</h3>
        <p>רוצה לחלוק מנוי עם 5 שותפים? פתח את הקבוצה הראשונה עכשיו!</p>
        <button class="btn btn-primary" onclick="openModal(newGroupModal)">
          👥 פתח קבוצה חדשה (5+1)
        </button>
      </div>
    `;
    return;
  }

  itemsGrid.innerHTML = groups.map(g => {
    const isFull = g.status === 'full' || g.slots_free === 0;
    const isClosed = g.status === 'closed';
    const statusLabel = isClosed ? '🔒 קבוצה סגורה' : (isFull ? '🔒 קבוצה מלאה' : `⚡ פתוחה (${g.slots_free} מקומות)`);
    const statusClass = isClosed ? 'badge-closed' : (isFull ? 'badge-full' : 'badge-open');

    // Slot visual circles
    const totalSlots = g.total_slots || 6;
    let slotBoxes = '';
    for (let i = 0; i < totalSlots; i++) {
      if (i === 0) {
        slotBoxes += `<span class="slot-dot manager" title="מנהל הקבוצה">👑</span>`;
      } else if (i < g.slots_taken) {
        slotBoxes += `<span class="slot-dot filled" title="מקום תפוס">✓</span>`;
      } else {
        slotBoxes += `<span class="slot-dot empty" title="מקום פנוי">○</span>`;
      }
    }

    return `
      <article class="group-card glass-panel ${g.has_discount ? 'has-discount' : ''} ${isFull ? 'full' : ''}" data-id="${g.id}">
        
        <div class="card-header">
          <div class="badge-group">
            <span class="badge ${statusClass}">${statusLabel}</span>
            ${g.has_discount ? `
              <span class="badge badge-discount-gold">
                🎓 ${escapeHtml(g.discount_label || 'הנחת סטודנט / מחיר מוזל')}
              </span>
            ` : ''}
            ${g.prepay_required ? `
              <span class="badge badge-prepay">
                📅 תשלום מראש: ל-${g.prepay_months} חודשים
              </span>
            ` : ''}
            ${g.require_approval ? `
              <span class="badge badge-approval">
                🔒 דורש אישור מנהל
              </span>
            ` : ''}
            ${g.private_members ? `
              <span class="badge badge-private">
                👁️‍🗨️ משתתפים חסויים
              </span>
            ` : ''}
            ${g.manager_forum_user ? `
              <span class="badge badge-forum" title="מנהל בפורום מתמחים/בינה טופ">
                👤 מנהל: <strong>@${escapeHtml(g.manager_forum_user)}</strong>
              </span>
            ` : ''}
          </div>
          <span class="post-date">${formatDate(g.created_at)}</span>
        </div>

        <div class="group-title-box">
          <h3 class="group-title">${escapeHtml(g.title)}</h3>
          <div class="manager-name">מנהל: <strong>${escapeHtml(g.manager_name)}</strong></div>
        </div>

        <!-- Occupancy Bar -->
        <div class="occupancy-container glass-card">
          <div class="occupancy-header">
            <span>תפוסת קבוצה (מנהל + 5 שותפים):</span>
            <strong style="color: var(--brand-gold);">${g.slots_taken}/${g.total_slots} תפוס</strong>
          </div>
          <div class="slots-visual">
            ${slotBoxes}
          </div>
          <div class="occupancy-sub">
            ${isClosed ? 'קבוצה זו נסגרה ע"י המנהל' : (isFull ? 'כל 5 המקומות תפוסים' : `נותרו עוד ${g.slots_free} מקומות פנויים`)}
          </div>
        </div>

        <!-- Meta details -->
        <div class="group-meta-grid">
          ${g.cost_per_member ? `
            <div class="meta-item">
              <span class="meta-label">עלות למשתתף:</span>
              <strong class="meta-value">${escapeHtml(g.cost_per_member)}</strong>
            </div>
          ` : ''}
          ${g.requirements ? `
            <div class="meta-item" style="grid-column: 1 / -1;">
              <span class="meta-label">📋 תנאי הצטרפות:</span>
              <span class="meta-value">${escapeHtml(g.requirements)}</span>
            </div>
          ` : ''}
        </div>

        ${g.notes ? `<div class="notes-box">${escapeHtml(g.notes)}</div>` : ''}

        <!-- Members preview -->
        <div class="members-preview">
          <span class="members-preview-title">חברי הקבוצה שהצטרפו (${g.members_count}/5):</span>
          <div class="members-chip-list">
            <span class="member-chip manager-chip">👑 מנהל: ${escapeHtml(g.manager_name)}</span>
            ${(g.members || []).map(m => `
              <span class="member-chip">
                ✓ ${escapeHtml(m.member_name)} ${m.member_forum_user ? `(@${escapeHtml(m.member_forum_user)})` : ''}
              </span>
            `).join('')}
            ${Array.from({ length: g.slots_free }).map(() => `
              <span class="member-chip empty-chip">+ מקום פנוי</span>
            `).join('')}
          </div>
        </div>

        <!-- Manager contact or Join Action -->
        <div class="contact-actions" style="margin-top: 1rem;">
          ${!isFull && !isClosed ? `
            <button class="btn btn-primary" onclick="openJoinModal(${g.id}, '${escapeHtml(g.title)}', ${g.require_approval})" style="width: 100%;">
              <span>⚡</span>
              <span>${g.require_approval ? 'בקש להצטרף לקבוצה (אישור מנהל)' : 'הצטרף לקבוצה עכשיו'}</span>
            </button>
          ` : `
            <button class="btn btn-outline" disabled style="width: 100%; opacity: 0.6; cursor: not-allowed;">
              ${isClosed ? '🔒 קבוצה זו סגורה' : '🔒 קבוצה מלאה (5/5)'}
            </button>
          `}
        </div>

        <div class="card-footer">
          <span style="color: var(--text-muted); font-size: 0.75rem;">קבוצה #${g.id}</span>
          <button class="btn btn-outline btn-icon" onclick="openAdminModal(${g.id})" title="ניהול מנהל הקבוצה">
            <span>⚙️</span>
            <span>ניהול מנהל</span>
          </button>
        </div>

      </article>
    `;
  }).join('');
}

/**
 * Copy Email to Clipboard
 */
function copyEmail(email, btn) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(email).then(() => {
      showToast('כתובת האימייל הועתקה ללוח!', 'success');
      const origText = btn.innerHTML;
      btn.innerHTML = '<span>✓</span><span>הועתק!</span>';
      setTimeout(() => { btn.innerHTML = origText; }, 2000);
    }).catch(() => fallbackCopy(email));
  } else {
    fallbackCopy(email);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('כתובת האימייל הועתקה ללוח!', 'success');
}

/**
 * Switch Navigation Tab
 */
function switchView(newView, activeBtn) {
  state.view = newView;

  switchTabs.forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  if (activeBtn) activeBtn.classList.add('active');

  if (newView === 'groups') {
    postsCostFilters.style.display = 'none';
    groupsFilters.style.display = 'flex';
  } else {
    postsCostFilters.style.display = 'flex';
    groupsFilters.style.display = 'none';
  }

  loadContent();
}

/**
 * Modal Management
 */
function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// Modal Click Backdrops & Close Buttons
document.querySelectorAll('.modal-backdrop').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-close');
    const targetModal = document.getElementById(modalId);
    if (targetModal) closeModal(targetModal);
  });
});

// Setup Action Buttons
if (openNewPostBtn) openNewPostBtn.addEventListener('click', () => openModal(newPostModal));
if (openNewGroupBtn) openNewGroupBtn.addEventListener('click', () => openModal(newGroupModal));
if (openFaqBtn) openFaqBtn.addEventListener('click', () => openModal(faqModal));

// Navigation Tabs Click Listeners
if (tabOffersBtn) tabOffersBtn.addEventListener('click', () => switchView('offers', tabOffersBtn));
if (tabRequestsBtn) tabRequestsBtn.addEventListener('click', () => switchView('requests', tabRequestsBtn));
if (tabAllBtn) tabAllBtn.addEventListener('click', () => switchView('all', tabAllBtn));
if (tabGroupsBtn) tabGroupsBtn.addEventListener('click', () => switchView('groups', tabGroupsBtn));

// Cost Filters (Posts)
postsCostFilters.querySelectorAll('.cost-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    postsCostFilters.querySelectorAll('.cost-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.postCost = chip.getAttribute('data-cost');
    loadPosts();
  });
});

// Group Filters
groupsFilters.querySelectorAll('.group-filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    groupsFilters.querySelectorAll('.group-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.groupFilter = chip.getAttribute('data-group-filter');
    loadGroups();
  });
});

// Search Input Debounced
let searchTimeout;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = searchInput.value.trim();
      loadContent();
    }, 250);
  });
}

/**
 * Submit New Post Form
 */
newPostForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitPostBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'שומר מודעה בשרת...';

  const payload = {
    type: document.getElementById('postType').value,
    name: document.getElementById('postName').value,
    email: document.getElementById('postEmail').value,
    forum_user: document.getElementById('postForumUser').value,
    cost_type: document.getElementById('postCostType').value,
    notes: document.getElementById('postNotes').value,
    pin: document.getElementById('postPin').value
  };

  try {
    const data = await apiCall('create_post', { method: 'POST', body: payload });
    showToast('המודעה פורסמה בהצלחה ונשמרה בשרת!', 'success');
    newPostForm.reset();
    closeModal(newPostModal);
    await loadStats();
    await loadPosts();
  } catch (err) {
    showToast(err.message || 'שגיאה בפרסום המודעה', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'פרסם מודעה עכשיו';
  }
});

/**
 * Submit New Group Form
 */
newGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitGroupBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'פותח קבוצה בשרת...';

  const payload = {
    title: document.getElementById('groupTitle').value,
    manager_name: document.getElementById('groupManagerName').value,
    manager_email: document.getElementById('groupManagerEmail').value,
    manager_forum_user: document.getElementById('groupManagerForum').value,
    has_discount: document.getElementById('groupHasDiscount').checked,
    discount_label: document.getElementById('groupDiscountLabel').value,
    cost_per_member: document.getElementById('groupCostPerMember').value,
    require_approval: document.getElementById('groupRequireApproval').checked,
    private_members: document.getElementById('groupPrivateMembers').checked,
    requirements: document.getElementById('groupRequirements').value,
    prepay_required: document.getElementById('groupPrepayRequired').checked,
    prepay_months: document.getElementById('groupPrepayMonths').value,
    notes: document.getElementById('groupNotes').value,
    pin: document.getElementById('groupPin').value
  };

  try {
    const data = await apiCall('create_group', { method: 'POST', body: payload });
    showToast('קבוצת השיתוף נפתחה בהצלחה ונשמרה בשרת!', 'success');
    newGroupForm.reset();
    closeModal(newGroupModal);
    await loadStats();
    switchView('groups', tabGroupsBtn);
  } catch (err) {
    showToast(err.message || 'שגיאה בפתיחת הקבוצה', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'פתח קבוצה עכשיו';
  }
});

/**
 * Join Group Flow
 */
function openJoinModal(groupId, groupTitle, requireApproval) {
  document.getElementById('joinGroupId').value = groupId;
  document.getElementById('joinMemberName').value = '';
  document.getElementById('joinMemberEmail').value = '';
  document.getElementById('joinMemberForum').value = '';
  document.getElementById('joinNotes').value = '';

  const introText = document.getElementById('joinGroupIntroText');
  if (introText) {
    introText.innerHTML = `
      הצטרפות לקבוצה: <strong>${groupTitle}</strong><br>
      ${requireApproval ? '<span style="color: var(--brand-gold-glow);">🔒 שים לב: קבוצה זו דורשת אישור מנהל. בקשתך תישלח למנהל לאישור.</span>' : '⚡ שים לב: ההצטרפות תופסת מקום מיידית בקבוצה.'}
    `;
  }

  openModal(joinGroupModal);
}

joinGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const groupId = document.getElementById('joinGroupId').value;
  const confirmBtn = document.getElementById('confirmJoinBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'שולח לשרת...';

  const payload = {
    group_id: groupId,
    member_name: document.getElementById('joinMemberName').value,
    member_email: document.getElementById('joinMemberEmail').value,
    member_forum_user: document.getElementById('joinMemberForum').value,
    notes: document.getElementById('joinNotes').value
  };

  try {
    const data = await apiCall('join_group', { method: 'POST', body: payload });
    showToast(data.message || 'הצטרפת לקבוצה בהצלחה!', 'success');
    closeModal(joinGroupModal);
    await loadStats();
    await loadGroups();
  } catch (err) {
    showToast(err.message || 'שגיאה בהצטרפות לקבוצה', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'שלח בקשת הצטרפות';
  }
});

/**
 * Manager Admin Modal Flow
 */
function openAdminModal(groupId) {
  state.adminGroupId = groupId;
  state.adminPin = '';
  document.getElementById('adminGroupId').value = groupId;
  document.getElementById('adminPinInput').value = '';
  
  document.getElementById('adminPinStep').style.display = 'block';
  document.getElementById('adminDashboardStep').style.display = 'none';

  openModal(groupAdminModal);
  setTimeout(() => document.getElementById('adminPinInput').focus(), 150);
}

adminPinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const groupId = document.getElementById('adminGroupId').value;
  const pin = document.getElementById('adminPinInput').value;
  const submitBtn = document.getElementById('adminPinSubmitBtn');

  submitBtn.disabled = true;
  submitBtn.textContent = 'מאמת קוד מול השרת...';

  try {
    const data = await apiCall('group_admin', {
      method: 'POST',
      body: { group_id: groupId, pin }
    });
    state.adminPin = pin;
    renderAdminDashboard(data.group);
  } catch (err) {
    showToast(err.message || 'קוד PIN שגוי', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'כניסה לניהול';
  }
});

function renderAdminDashboard(group) {
  document.getElementById('adminPinStep').style.display = 'none';
  document.getElementById('adminDashboardStep').style.display = 'block';

  document.getElementById('adminGroupTitle').textContent = group.title;
  document.getElementById('adminGroupStats').textContent = 
    `סטטוס: ${group.status} | תפוסה: ${group.slots_taken}/${group.total_slots} (${group.members_count}/5 שותפים)`;

  // Pending Approvals
  const pendingSection = document.getElementById('adminPendingSection');
  const pendingList = document.getElementById('adminPendingList');
  if (group.pending_members && group.pending_members.length > 0) {
    pendingSection.style.display = 'block';
    pendingList.innerHTML = group.pending_members.map(m => `
      <div class="pending-item glass-card" style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem; margin-bottom: 0.5rem; border: 1px solid rgba(212,175,55,0.3); border-radius: var(--radius-sm);">
        <div>
          <strong>${escapeHtml(m.member_name)}</strong>
          <span style="font-size: 0.8rem; color: var(--text-muted);"> (${escapeHtml(m.member_email)})</span>
          ${m.member_forum_user ? `<br><small style="color: var(--brand-gold);">👤 @${escapeHtml(m.member_forum_user)}</small>` : ''}
          ${m.notes ? `<div style="font-size: 0.8rem; margin-top: 0.2rem;">${escapeHtml(m.notes)}</div>` : ''}
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-primary btn-sm" onclick="approveMember(${group.id}, ${m.id})">✅ אשר</button>
          <button class="btn btn-outline btn-sm" onclick="removeMember(${group.id}, ${m.id})">❌ דחה</button>
        </div>
      </div>
    `).join('');
  } else {
    pendingSection.style.display = 'none';
    pendingList.innerHTML = '';
  }

  // Active Approved Members
  const activeList = document.getElementById('adminActiveMembersList');
  if (group.members && group.members.length > 0) {
    activeList.innerHTML = group.members.map(m => `
      <div class="active-member-item glass-card" style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem; margin-bottom: 0.5rem; border-radius: var(--radius-sm);">
        <div>
          <strong>${escapeHtml(m.member_name)}</strong>
          <span style="font-size: 0.8rem; color: var(--text-muted);"> (${escapeHtml(m.member_email)})</span>
          ${m.member_forum_user ? `<br><small style="color: var(--brand-gold);">👤 @${escapeHtml(m.member_forum_user)}</small>` : ''}
        </div>
        <div>
          <button class="btn btn-outline btn-sm" style="color: #ff6b6b; border-color: rgba(255,107,107,0.4);" onclick="removeMember(${group.id}, ${m.id})">
            ❌ הוצא מהקבוצה
          </button>
        </div>
      </div>
    `).join('');
  } else {
    activeList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">טרם הצטרפו שותפים לקבוצה זו.</div>';
  }

  // Status toggle
  const toggleBtn = document.getElementById('adminToggleStatusBtn');
  if (group.status === 'closed') {
    toggleBtn.textContent = '🔓 פתח קבוצה מחדש';
    toggleBtn.onclick = () => reopenAdminGroup(group.id);
  } else {
    toggleBtn.textContent = '🔒 סגור קבוצה זו';
    toggleBtn.onclick = () => closeAdminGroup(group.id);
  }

  // Delete button
  document.getElementById('adminDeleteGroupBtn').onclick = () => deleteAdminGroup(group.id);
}

/**
 * Approve member
 */
window.approveMember = async function(groupId, memberId) {
  try {
    const data = await apiCall('approve_member', {
      method: 'POST',
      body: { group_id: groupId, member_id: memberId, pin: state.adminPin }
    });
    showToast('המשתתף אושר בהצלחה ונוסף לקבוצה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
    loadStats();
  } catch (err) {
    showToast(err.message || 'שגיאה באישור המשתתף', 'error');
  }
};

/**
 * Remove member
 */
window.removeMember = async function(groupId, memberId) {
  if (!confirm('האם אתה בטוח שברצונך להוציא משתתף זה מהקבוצה?')) return;

  try {
    const data = await apiCall('remove_member', {
      method: 'POST',
      body: { group_id: groupId, member_id: memberId, pin: state.adminPin }
    });
    showToast('המשתתף הוסר והמקום פונה בהצלחה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
    loadStats();
  } catch (err) {
    showToast(err.message || 'שגיאה בהסרת המשתתף', 'error');
  }
};

async function refreshAdminDashboard(groupId) {
  try {
    const data = await apiCall('group_admin', {
      method: 'POST',
      body: { group_id: groupId, pin: state.adminPin }
    });
    renderAdminDashboard(data.group);
  } catch (err) {
    showToast(err.message || 'שגיאה ברענון לוח הניהול', 'error');
  }
}

async function closeAdminGroup(groupId) {
  try {
    await apiCall('close_group', {
      method: 'POST',
      body: { group_id: groupId, pin: state.adminPin }
    });
    showToast('הקבוצה סומנה כסגורה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
  } catch (err) {
    showToast(err.message || 'שגיאה בסגירת הקבוצה', 'error');
  }
}

async function reopenAdminGroup(groupId) {
  try {
    await apiCall('reopen_group', {
      method: 'POST',
      body: { group_id: groupId, pin: state.adminPin }
    });
    showToast('הקבוצה נפתחה מחדש בהצלחה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
  } catch (err) {
    showToast(err.message || 'שגיאה בפתיחת הקבוצה מחדש', 'error');
  }
}

async function deleteAdminGroup(groupId) {
  if (!confirm('האם אתה בטוח שברצונך למחוק קבוצה זו לצמיתות?')) return;

  try {
    await apiCall('delete_group', {
      method: 'POST',
      body: { group_id: groupId, pin: state.adminPin }
    });
    showToast('הקבוצה נמחקה בהצלחה מהשרת', 'success');
    closeModal(groupAdminModal);
    loadGroups();
    loadStats();
  } catch (err) {
    showToast(err.message || 'שגיאה במחיקת הקבוצה', 'error');
  }
}

/**
 * Delete Individual Post Flow
 */
function openDeletePostModal(postId) {
  document.getElementById('deletePostId').value = postId;
  document.getElementById('deletePin').value = '';
  openModal(deletePostModal);
  setTimeout(() => document.getElementById('deletePin').focus(), 150);
}

deletePostForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const postId = document.getElementById('deletePostId').value;
  const pin = document.getElementById('deletePin').value;
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'מוחק מהשרת...';

  try {
    await apiCall('delete_post', {
      method: 'POST',
      body: { id: postId, pin }
    });
    showToast('המודעה הוסרה בהצלחה מהלוח', 'success');
    closeModal(deletePostModal);
    await loadStats();
    await loadPosts();
  } catch (err) {
    showToast(err.message || 'קוד סודי (PIN) שגוי', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'מחק מודעה';
  }
});

// Initial Bootstrap on page load
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  switchView('offers', tabOffersBtn); // Default view: Individual Offers!
});
