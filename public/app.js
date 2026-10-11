// ==========================================================================
// Gemini Share Hub — Client Application Logic
// Features: Dual Mode (Live Node.js Server + GitHub Pages Static Fallback)
// Primary Focus: Individual Posts (Offers & Requests)
// Secondary: Group Pooling (5 Members Cost Sharing) with Admin Management
// ==========================================================================

// Master Admin PIN that works everywhere for all posts and groups
const MASTER_PIN = '1123355';

// Detect Static Environment (GitHub Pages / file:// protocol)
const isStaticEnv = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

// Default Seed Data for Clean Production Board (Zero samples)
const SEED_POSTS = [];
const SEED_GROUPS = [];

// Local Client-Side Database (Active on GitHub Pages)
const LocalDB = {
  getPostsKey: () => 'gemini_share_posts_v3',
  getGroupsKey: () => 'gemini_share_groups_v3',

  init() {
    // Clear legacy seed cache from earlier testing versions
    ['gemini_share_posts_v1', 'gemini_share_groups_v1', 'gemini_share_posts_v2', 'gemini_share_groups_v2'].forEach(k => {
      localStorage.removeItem(k);
    });

    // Purge any lingering sample records that might have been cached
    let posts = JSON.parse(localStorage.getItem(this.getPostsKey()) || '[]');
    posts = posts.filter(p => p.email && !p.email.includes('eli.pro') && !p.email.includes('david.ai') && !p.email.includes('test'));
    localStorage.setItem(this.getPostsKey(), JSON.stringify(posts));

    let groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    groups = groups.filter(g => g.manager_email && !g.manager_email.includes('yonatan.gemini') && !g.manager_email.includes('test'));
    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
  },

  getPosts(filters = {}) {
    this.init();
    let posts = JSON.parse(localStorage.getItem(this.getPostsKey()) || '[]');
    if (filters.type && filters.type !== 'all') {
      posts = posts.filter(p => p.type === filters.type);
    }
    if (filters.cost_type && filters.cost_type !== 'all') {
      posts = posts.filter(p => p.cost_type === filters.cost_type);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      posts = posts.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)) ||
        (p.forum_user && p.forum_user.toLowerCase().includes(q))
      );
    }
    return posts.filter(p => p.status === 'active').sort((a,b) => b.id - a.id);
  },

  createPost(data) {
    this.init();
    const posts = JSON.parse(localStorage.getItem(this.getPostsKey()) || '[]');
    const newPost = {
      id: Date.now(),
      type: data.type,
      name: data.name,
      email: data.email,
      forum_user: data.forum_user ? data.forum_user.replace(/^@/, '') : null,
      cost_type: data.cost_type,
      notes: data.notes,
      pin: String(data.pin).trim(),
      status: 'active',
      created_at: new Date().toISOString()
    };
    posts.unshift(newPost);
    localStorage.setItem(this.getPostsKey(), JSON.stringify(posts));
    return newPost;
  },

  deletePost(id, pin) {
    this.init();
    let posts = JSON.parse(localStorage.getItem(this.getPostsKey()) || '[]');
    const post = posts.find(p => p.id === Number(id));
    if (!post) return { success: false, error: 'המודעה לא נמצאה' };
    const cleanPin = String(pin || '').trim();
    if (cleanPin !== MASTER_PIN && post.pin !== cleanPin) {
      return { success: false, error: 'קוד סודי (PIN) שגוי' };
    }
    posts = posts.filter(p => p.id !== Number(id));
    localStorage.setItem(this.getPostsKey(), JSON.stringify(posts));
    return { success: true };
  },

  getGroups(filters = {}) {
    this.init();
    let groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    if (filters.has_discount === 'true') {
      groups = groups.filter(g => g.has_discount);
    }
    if (filters.status === 'open') {
      groups = groups.filter(g => g.status === 'open');
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      groups = groups.filter(g =>
        (g.title && g.title.toLowerCase().includes(q)) ||
        (g.manager_name && g.manager_name.toLowerCase().includes(q)) ||
        (g.notes && g.notes.toLowerCase().includes(q)) ||
        (g.manager_forum_user && g.manager_forum_user.toLowerCase().includes(q))
      );
    }
    return groups.sort((a,b) => b.id - a.id);
  },

  createGroup(data) {
    this.init();
    const groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const newGroup = {
      id: Date.now(),
      title: data.title || (data.has_discount ? `🎓 [הנחת סטודנט] קבוצת שיתוף — ${data.manager_name}` : `👥 קבוצת שיתוף — ${data.manager_name}`),
      manager_name: data.manager_name,
      manager_email: data.manager_email,
      manager_forum_user: data.manager_forum_user ? data.manager_forum_user.replace(/^@/, '') : null,
      has_discount: Boolean(data.has_discount),
      discount_label: data.discount_label || 'הנחת סטודנט / מחיר מוזל',
      cost_per_member: data.cost_per_member,
      total_slots: 6,
      require_approval: Boolean(data.require_approval),
      private_members: Boolean(data.private_members),
      requirements: data.requirements,
      prepay_required: Boolean(data.prepay_required),
      prepay_months: Number(data.prepay_months) || 1,
      notes: data.notes,
      pin: String(data.pin).trim(),
      status: 'open',
      members: [],
      pending_members: [],
      members_count: 0,
      pending_count: 0,
      slots_taken: 1,
      slots_free: 5,
      needed_members: 5,
      created_at: new Date().toISOString()
    };
    groups.unshift(newGroup);
    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
    return newGroup;
  },

  joinGroup(groupId, memberData) {
    this.init();
    const groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const group = groups.find(g => g.id === Number(groupId));
    if (!group) return { success: false, error: 'הקבוצה לא נמצאה' };
    if (group.slots_free <= 0) return { success: false, error: 'הקבוצה מלאה' };

    const newMember = {
      id: Date.now(),
      member_name: memberData.member_name,
      member_email: memberData.member_email,
      member_forum_user: memberData.member_forum_user ? memberData.member_forum_user.replace(/^@/, '') : null,
      notes: memberData.notes,
      status: group.require_approval ? 'pending' : 'approved',
      created_at: new Date().toISOString()
    };

    if (group.require_approval) {
      if (!group.pending_members) group.pending_members = [];
      group.pending_members.push(newMember);
      group.pending_count = group.pending_members.length;
    } else {
      if (!group.members) group.members = [];
      group.members.push(newMember);
      group.members_count = group.members.length;
      group.slots_taken = 1 + group.members_count;
      group.slots_free = Math.max(0, group.total_slots - group.slots_taken);
      if (group.slots_free === 0) group.status = 'full';
    }

    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
    return {
      success: true,
      group,
      isPending: group.require_approval,
      message: group.require_approval ? 'בקשתך נרשמה בהצלחה וממתינה לאישור המנהל' : 'הצטרפת לקבוצה בהצלחה!'
    };
  },

  adminGroup(groupId, pin) {
    this.init();
    const groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const group = groups.find(g => g.id === Number(groupId));
    if (!group) return { success: false, error: 'הקבוצה לא נמצאה' };
    const cleanPin = String(pin || '').trim();
    if (cleanPin !== MASTER_PIN && group.pin !== cleanPin) {
      return { success: false, error: 'קוד ניהול (PIN) שגוי' };
    }
    return { success: true, group };
  },

  approveMember(groupId, memberId, pin) {
    this.init();
    const groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const group = groups.find(g => g.id === Number(groupId));
    const cleanPin = String(pin || '').trim();
    if (!group || (cleanPin !== MASTER_PIN && group.pin !== cleanPin)) {
      return { success: false, error: 'קוד שגוי' };
    }

    const pendingIdx = (group.pending_members || []).findIndex(m => m.id === Number(memberId));
    if (pendingIdx === -1) return { success: false, error: 'המשתתף לא נמצא' };

    const member = group.pending_members.splice(pendingIdx, 1)[0];
    member.status = 'approved';
    if (!group.members) group.members = [];
    group.members.push(member);

    group.pending_count = group.pending_members.length;
    group.members_count = group.members.length;
    group.slots_taken = 1 + group.members_count;
    group.slots_free = Math.max(0, group.total_slots - group.slots_taken);
    if (group.slots_free === 0) group.status = 'full';

    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
    return { success: true };
  },

  removeMember(groupId, memberId, pin) {
    this.init();
    const groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const group = groups.find(g => g.id === Number(groupId));
    const cleanPin = String(pin || '').trim();
    if (!group || (cleanPin !== MASTER_PIN && group.pin !== cleanPin)) {
      return { success: false, error: 'קוד שגוי' };
    }

    if (group.members) {
      group.members = group.members.filter(m => m.id !== Number(memberId));
    }
    if (group.pending_members) {
      group.pending_members = group.pending_members.filter(m => m.id !== Number(memberId));
    }

    group.members_count = (group.members || []).length;
    group.pending_count = (group.pending_members || []).length;
    group.slots_taken = 1 + group.members_count;
    group.slots_free = Math.max(0, group.total_slots - group.slots_taken);
    if (group.slots_free > 0 && group.status === 'full') group.status = 'open';

    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
    return { success: true };
  },

  deleteGroup(groupId, pin) {
    this.init();
    let groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const group = groups.find(g => g.id === Number(groupId));
    if (!group) return { success: false, error: 'הקבוצה לא נמצאה' };
    const cleanPin = String(pin || '').trim();
    if (cleanPin !== MASTER_PIN && group.pin !== cleanPin) {
      return { success: false, error: 'קוד ניהול (PIN) שגוי' };
    }
    groups = groups.filter(g => g.id !== Number(groupId));
    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
    return { success: true };
  },

  toggleGroupStatus(groupId, newStatus, pin) {
    this.init();
    let groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    const group = groups.find(g => g.id === Number(groupId));
    if (!group) return { success: false, error: 'הקבוצה לא נמצאה' };
    const cleanPin = String(pin || '').trim();
    if (cleanPin !== MASTER_PIN && group.pin !== cleanPin) {
      return { success: false, error: 'קוד ניהול (PIN) שגוי' };
    }
    group.status = newStatus;
    localStorage.setItem(this.getGroupsKey(), JSON.stringify(groups));
    return { success: true, group };
  },

  getStats() {
    this.init();
    const posts = JSON.parse(localStorage.getItem(this.getPostsKey()) || '[]').filter(p => p.status === 'active');
    const groups = JSON.parse(localStorage.getItem(this.getGroupsKey()) || '[]');
    return {
      offers: posts.filter(p => p.type === 'offer').length,
      requests: posts.filter(p => p.type === 'request').length,
      groups: groups.filter(g => g.status === 'open' || g.status === 'full').length
    };
  }
};

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
 * Load Stats
 */
async function loadStats() {
  if (isStaticEnv) {
    const stats = LocalDB.getStats();
    if (offersCountEl) offersCountEl.textContent = stats.offers;
    if (requestsCountEl) requestsCountEl.textContent = stats.requests;
    if (groupsCountEl) groupsCountEl.textContent = stats.groups;
    return;
  }

  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();
    if (data.success && data.stats) {
      if (offersCountEl) offersCountEl.textContent = data.stats.offers;
      if (requestsCountEl) requestsCountEl.textContent = data.stats.requests;
      if (groupsCountEl) groupsCountEl.textContent = data.stats.groups;
    }
  } catch (err) {
    const stats = LocalDB.getStats();
    if (offersCountEl) offersCountEl.textContent = stats.offers;
    if (requestsCountEl) requestsCountEl.textContent = stats.requests;
    if (groupsCountEl) groupsCountEl.textContent = stats.groups;
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

  if (isStaticEnv) {
    state.posts = LocalDB.getPosts(filters);
    renderPosts(state.posts);
    return;
  }

  try {
    const params = new URLSearchParams();
    if (filters.type !== 'all') params.append('type', filters.type);
    if (filters.cost_type !== 'all') params.append('cost_type', filters.cost_type);
    if (filters.search.trim()) params.append('search', filters.search.trim());

    const res = await fetch(`/api/posts?${params.toString()}`);
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success) {
      state.posts = data.posts;
      renderPosts(data.posts);
    } else {
      showToast(data.error || 'שגיאה בטעינת המודעות', 'error');
    }
  } catch (err) {
    state.posts = LocalDB.getPosts(filters);
    renderPosts(state.posts);
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

  if (isStaticEnv) {
    state.groups = LocalDB.getGroups(filters);
    renderGroups(state.groups);
    return;
  }

  try {
    const params = new URLSearchParams();
    if (filters.status === 'open') params.append('status', 'open');
    if (filters.has_discount === 'true') params.append('has_discount', 'true');
    if (filters.search.trim()) params.append('search', filters.search.trim());

    const res = await fetch(`/api/groups?${params.toString()}`);
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success) {
      state.groups = data.groups;
      renderGroups(data.groups);
    } else {
      showToast(data.error || 'שגיאה בטעינת הקבוצות', 'error');
    }
  } catch (err) {
    state.groups = LocalDB.getGroups(filters);
    renderGroups(state.groups);
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
            ${g.slots_free > 0 ? `נותרו עוד <strong>${g.slots_free}</strong> מקומות פנויים להצטרפות` : `כל המקומות נתפסו`}
            ${g.pending_count > 0 ? ` • <span style="color: var(--brand-gold-glow);">${g.pending_count} ממתינים לאישור</span>` : ''}
          </div>
        </div>

        <!-- Cost & Requirements -->
        <div class="group-details-box">
          ${g.cost_per_member ? `
            <div class="detail-row">
              <span class="detail-label">עלות למשתתף:</span>
              <strong class="detail-val" style="color: var(--brand-gold);">${escapeHtml(g.cost_per_member)}</strong>
            </div>
          ` : ''}
          ${g.requirements ? `
            <div class="requirements-box">
              <strong>📋 תנאי הצטרפות:</strong>
              <p>${escapeHtml(g.requirements)}</p>
            </div>
          ` : ''}
          ${g.notes ? `
            <div class="notes-box" style="margin-top: 0.5rem;">${escapeHtml(g.notes)}</div>
          ` : ''}
        </div>

        <!-- Manager Contact -->
        <div class="contact-actions">
          <div class="email-box">
            <span class="email-address">${escapeHtml(g.manager_email)}</span>
            <button class="btn-icon btn-copy" onclick="copyEmail('${escapeHtml(g.manager_email)}', this)" title="העתק מייל מנהל">
              <span>📋</span>
              <span>העתק</span>
            </button>
          </div>
        </div>

        <!-- Group Actions -->
        <div class="group-card-actions">
          ${(!isFull && !isClosed) ? `
            <button class="btn btn-primary" style="flex: 1;" onclick="openJoinModal(${g.id}, '${escapeHtml(g.title).replace(/'/g, "\\'")}', ${Boolean(g.require_approval)})">
              🤝 הצטרף לקבוצה
            </button>
          ` : `
            <button class="btn btn-outline" style="flex: 1; opacity: 0.7; cursor: not-allowed;" disabled>
              ${isClosed ? 'קבוצה סגורה' : 'קבוצה מלאה'}
            </button>
          `}
          
          <button class="btn btn-outline btn-icon" onclick="openAdminModal(${g.id})" title="ניהול מנהל הקבוצה">
            <span>⚙️</span>
            <span>ניהול מנהל</span>
          </button>
        </div>

        <div class="card-footer">
          <span style="color: var(--text-muted); font-size: 0.75rem;">קבוצה #${g.id}</span>
        </div>

      </article>
    `;
  }).join('');
}

/**
 * Copy Email
 */
async function copyEmail(email, button) {
  try {
    await navigator.clipboard.writeText(email);
    const originalText = button.innerHTML;
    button.innerHTML = '<span>✓</span><span>הועתק!</span>';
    button.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
    button.style.color = '#10b981';
    showToast(`כתובת המייל ${email} הועתקה ללוח`, 'success');
    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.backgroundColor = '';
      button.style.color = '';
    }, 2000);
  } catch (err) {
    const input = document.createElement('input');
    input.value = email;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast(`כתובת המייל הועתקה!`, 'success');
  }
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

// Global modal close handlers
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-close');
    const modal = document.getElementById(modalId);
    if (modal) closeModal(modal);
  });
});

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.active').forEach(closeModal);
  }
});

// Trigger Buttons
if (openNewPostBtn) openNewPostBtn.addEventListener('click', () => openModal(newPostModal));
if (openNewGroupBtn) openNewGroupBtn.addEventListener('click', () => openModal(newGroupModal));
if (openFaqBtn) openFaqBtn.addEventListener('click', () => openModal(faqModal));

/**
 * Radio card styling helper
 */
function setupRadioGroup(containerSelector) {
  const cards = document.querySelectorAll(containerSelector);
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
}
setupRadioGroup('#newPostModal .radio-cards:nth-of-type(1) .radio-card');
setupRadioGroup('#newPostModal .radio-cards:nth-of-type(2) .radio-card');

/**
 * Tab Switching (Primary: Offers, Requests, All, Groups)
 */
tabOffersBtn.addEventListener('click', () => switchView('offers', tabOffersBtn));
tabRequestsBtn.addEventListener('click', () => switchView('requests', tabRequestsBtn));
tabAllBtn.addEventListener('click', () => switchView('all', tabAllBtn));
tabGroupsBtn.addEventListener('click', () => switchView('groups', tabGroupsBtn));

function switchView(viewName, activeBtn) {
  state.view = viewName;
  switchTabs.forEach(t => {
    if (t) {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    }
  });
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
  }

  // Update Toolbar
  if (viewName === 'groups') {
    postsCostFilters.style.display = 'none';
    groupsFilters.style.display = 'flex';
  } else {
    postsCostFilters.style.display = 'flex';
    groupsFilters.style.display = 'none';
  }

  loadContent();
}

/**
 * Filter Chips: Posts Cost
 */
postsCostFilters.addEventListener('click', (e) => {
  const chip = e.target.closest('.cost-chip');
  if (!chip) return;
  postsCostFilters.querySelectorAll('.cost-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.postCost = chip.dataset.cost;
  loadPosts();
});

/**
 * Filter Chips: Groups
 */
groupsFilters.addEventListener('click', (e) => {
  const chip = e.target.closest('.cost-chip');
  if (!chip) return;
  groupsFilters.querySelectorAll('.cost-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.groupFilter = chip.dataset.groupFilter;
  loadGroups();
});

/**
 * Live Search (Debounced)
 */
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.search = e.target.value;
    loadContent();
  }, 250);
});

/**
 * Handle New Individual Post Submission
 */
newPostForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitPostBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'מפרסם מודעה...';

  const formData = new FormData(newPostForm);
  const payload = {
    website: formData.get('website'),
    type: formData.get('type'),
    name: formData.get('name'),
    email: formData.get('email'),
    forum_user: formData.get('forum_user'),
    cost_type: formData.get('cost_type'),
    notes: formData.get('notes'),
    pin: formData.get('pin')
  };

  if (isStaticEnv) {
    LocalDB.createPost(payload);
    showToast('המודעה פורסמה בהצלחה בלוח!', 'success');
    newPostForm.reset();
    closeModal(newPostModal);
    loadStats();
    loadPosts();
    submitBtn.disabled = false;
    submitBtn.textContent = 'פרסם מודעה עכשיו';
    return;
  }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success) {
      showToast('המודעה פורסמה בהצלחה בלוח!', 'success');
      newPostForm.reset();
      closeModal(newPostModal);
      await loadStats();
      if (state.view !== 'groups') {
        await loadPosts();
      }
    } else {
      showToast(data.error || 'שגיאה בפרסום המודעה', 'error');
    }
  } catch (err) {
    LocalDB.createPost(payload);
    showToast('המודעה פורסמה בהצלחה בלוח!', 'success');
    newPostForm.reset();
    closeModal(newPostModal);
    loadStats();
    loadPosts();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'פרסם מודעה עכשיו';
  }
});

/**
 * Handle New Group Submission
 */
newGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('submitGroupBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'פותח קבוצה...';

  const formData = new FormData(newGroupForm);
  const payload = {
    website: formData.get('website'),
    title: formData.get('title'),
    manager_name: formData.get('manager_name'),
    manager_email: formData.get('manager_email'),
    manager_forum_user: formData.get('manager_forum_user'),
    has_discount: groupHasDiscount ? groupHasDiscount.checked : false,
    discount_label: formData.get('discount_label'),
    cost_per_member: formData.get('cost_per_member'),
    prepay_required: groupPrepayRequired ? groupPrepayRequired.checked : false,
    prepay_months: formData.get('prepay_months'),
    require_approval: document.getElementById('groupRequireApproval').checked,
    private_members: document.getElementById('groupPrivateMembers').checked,
    requirements: formData.get('requirements'),
    notes: formData.get('notes'),
    pin: formData.get('pin')
  };

  if (isStaticEnv) {
    LocalDB.createGroup(payload);
    showToast('קבוצת השיתוף נפתחה בהצלחה!', 'success');
    newGroupForm.reset();
    if (discountDetailsBox) discountDetailsBox.style.display = 'none';
    if (prepayDetailsBox) prepayDetailsBox.style.display = 'none';
    closeModal(newGroupModal);
    loadStats();
    switchView('groups', tabGroupsBtn);
    submitBtn.disabled = false;
    submitBtn.textContent = 'פתח קבוצה עכשיו';
    return;
  }

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success) {
      showToast('קבוצת השיתוף נפתחה בהצלחה!', 'success');
      newGroupForm.reset();
      if (discountDetailsBox) discountDetailsBox.style.display = 'none';
      if (prepayDetailsBox) prepayDetailsBox.style.display = 'none';
      closeModal(newGroupModal);
      await loadStats();
      switchView('groups', tabGroupsBtn);
    } else {
      showToast(data.error || 'שגיאה בפתיחת הקבוצה', 'error');
    }
  } catch (err) {
    LocalDB.createGroup(payload);
    showToast('קבוצת השיתוף נפתחה בהצלחה!', 'success');
    newGroupForm.reset();
    closeModal(newGroupModal);
    loadStats();
    switchView('groups', tabGroupsBtn);
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
  confirmBtn.textContent = 'שולח...';

  const payload = {
    member_name: document.getElementById('joinMemberName').value,
    member_email: document.getElementById('joinMemberEmail').value,
    member_forum_user: document.getElementById('joinMemberForum').value,
    notes: document.getElementById('joinNotes').value
  };

  if (isStaticEnv) {
    const res = LocalDB.joinGroup(groupId, payload);
    if (res.success) {
      showToast(res.message, 'success');
      closeModal(joinGroupModal);
      loadStats();
      loadGroups();
    } else {
      showToast(res.error, 'error');
    }
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'שלח בקשת הצטרפות';
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success) {
      showToast(data.message || 'הצטרפת לקבוצה בהצלחה!', 'success');
      closeModal(joinGroupModal);
      await loadStats();
      await loadGroups();
    } else {
      showToast(data.error || 'שגיאה בהצטרפות לקבוצה', 'error');
    }
  } catch (err) {
    const res = LocalDB.joinGroup(groupId, payload);
    if (res.success) {
      showToast(res.message, 'success');
      closeModal(joinGroupModal);
      loadStats();
      loadGroups();
    } else {
      showToast(res.error, 'error');
    }
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'שלח בקשת הצטרפות';
  }
});

/**
 * Manager Admin Modal Flow (View unmasked members, approve pending, remove members)
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
  submitBtn.textContent = 'מאמת קוד...';

  if (isStaticEnv) {
    const res = LocalDB.adminGroup(groupId, pin);
    if (res.success) {
      state.adminPin = pin;
      renderAdminDashboard(res.group);
    } else {
      showToast(res.error, 'error');
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'כניסה לניהול';
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success && data.group) {
      state.adminPin = pin;
      renderAdminDashboard(data.group);
    } else {
      showToast(data.error || 'קוד PIN שגוי', 'error');
    }
  } catch (err) {
    const res = LocalDB.adminGroup(groupId, pin);
    if (res.success) {
      state.adminPin = pin;
      renderAdminDashboard(res.group);
    } else {
      showToast('קוד PIN שגוי או תקלה בחיבור', 'error');
    }
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
      <div class="admin-member-card glass-card">
        <div class="member-meta">
          <strong>${escapeHtml(m.member_name)}</strong>
          <span style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(m.member_email)}</span>
          ${m.member_forum_user ? `<span class="badge badge-forum" style="font-size: 0.75rem;">@${escapeHtml(m.member_forum_user)}</span>` : ''}
          ${m.notes ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(m.notes)}</div>` : ''}
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-icon" onclick="approveMember(${group.id}, ${m.id})">
            <span>✅</span>
            <span>אשר</span>
          </button>
          <button class="btn btn-danger btn-icon" onclick="removeMember(${group.id}, ${m.id})">
            <span>❌</span>
            <span>דחה</span>
          </button>
        </div>
      </div>
    `).join('');
  } else {
    pendingSection.style.display = 'none';
    pendingList.innerHTML = '';
  }

  // Approved Members
  const membersList = document.getElementById('adminMembersList');
  if (group.members && group.members.length > 0) {
    membersList.innerHTML = group.members.map((m, idx) => `
      <div class="admin-member-card glass-card">
        <div class="member-meta">
          <strong>#${idx + 1} ${escapeHtml(m.member_name)}</strong>
          <span style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(m.member_email)}</span>
          ${m.member_forum_user ? `<span class="badge badge-forum" style="font-size: 0.75rem;">@${escapeHtml(m.member_forum_user)}</span>` : ''}
          ${m.notes ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(m.notes)}</div>` : ''}
        </div>
        <button class="btn btn-danger btn-icon" onclick="removeMember(${group.id}, ${m.id})" title="הוצא שותף זה מהקבוצה ופנה מקום">
          <span>❌</span>
          <span>הוצא מהקבוצה</span>
        </button>
      </div>
    `).join('');
  } else {
    membersList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">עדיין אין שותפים שהצטרפו לקבוצה זו.</p>`;
  }

  // Toggle Close / Reopen button
  const toggleBtn = document.getElementById('adminToggleCloseBtn');
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
  if (isStaticEnv) {
    const res = LocalDB.approveMember(groupId, memberId, state.adminPin);
    if (res.success) {
      showToast('המשתתף אושר בהצלחה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
      loadStats();
    } else {
      showToast(res.error, 'error');
    }
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/members/${memberId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.adminPin })
    });
    const data = await res.json();
    if (data.success) {
      showToast('המשתתף אושר בהצלחה ונוסף לקבוצה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
      loadStats();
    } else {
      showToast(data.error || 'שגיאה באישור המשתתף', 'error');
    }
  } catch (err) {
    LocalDB.approveMember(groupId, memberId, state.adminPin);
    showToast('המשתתף אושר בהצלחה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
    loadStats();
  }
};

/**
 * Remove member
 */
window.removeMember = async function(groupId, memberId) {
  if (!confirm('האם אתה בטוח שברצונך להוציא משתתף זה מהקבוצה?')) return;

  if (isStaticEnv) {
    const res = LocalDB.removeMember(groupId, memberId, state.adminPin);
    if (res.success) {
      showToast('המשתתף הוסר בהצלחה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
      loadStats();
    } else {
      showToast(res.error, 'error');
    }
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/remove-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.adminPin, member_id: memberId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('המשתתף הוסר והמקום פונה בהצלחה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
      loadStats();
    } else {
      showToast(data.error || 'שגיאה בהסרת המשתתף', 'error');
    }
  } catch (err) {
    LocalDB.removeMember(groupId, memberId, state.adminPin);
    showToast('המשתתף הוסר בהצלחה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
    loadStats();
  }
};

async function refreshAdminDashboard(groupId) {
  if (isStaticEnv) {
    const res = LocalDB.adminGroup(groupId, state.adminPin);
    if (res.success) renderAdminDashboard(res.group);
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.adminPin })
    });
    const data = await res.json();
    if (data.success) {
      renderAdminDashboard(data.group);
    }
  } catch (err) {
    const res = LocalDB.adminGroup(groupId, state.adminPin);
    if (res.success) renderAdminDashboard(res.group);
  }
}

async function closeAdminGroup(groupId) {
  if (isStaticEnv) {
    const res = LocalDB.toggleGroupStatus(groupId, 'closed', state.adminPin);
    if (res.success) {
      showToast('הקבוצה סומנה כסגורה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
    } else {
      showToast(res.error, 'error');
    }
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.adminPin })
    });
    const data = await res.json();
    if (data.success) {
      showToast('הקבוצה סומנה כסגורה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
    } else {
      showToast(data.error || 'שגיאה בסגירת הקבוצה', 'error');
    }
  } catch (err) {
    const res = LocalDB.toggleGroupStatus(groupId, 'closed', state.adminPin);
    showToast('הקבוצה סומנה כסגורה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
  }
}

async function reopenAdminGroup(groupId) {
  if (isStaticEnv) {
    const res = LocalDB.toggleGroupStatus(groupId, 'open', state.adminPin);
    if (res.success) {
      showToast('הקבוצה נפתחה מחדש בהצלחה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
    } else {
      showToast(res.error, 'error');
    }
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.adminPin })
    });
    const data = await res.json();
    if (data.success) {
      showToast('הקבוצה נפתחה מחדש בהצלחה', 'success');
      refreshAdminDashboard(groupId);
      loadGroups();
    } else {
      showToast(data.error || 'שגיאה בפתיחת הקבוצה מחדש', 'error');
    }
  } catch (err) {
    const res = LocalDB.toggleGroupStatus(groupId, 'open', state.adminPin);
    showToast('הקבוצה נפתחה מחדש בהצלחה', 'success');
    refreshAdminDashboard(groupId);
    loadGroups();
  }
}

async function deleteAdminGroup(groupId) {
  if (!confirm('האם אתה בטוח שברצונך למחוק קבוצה זו לצמיתות?')) return;

  if (isStaticEnv) {
    const res = LocalDB.deleteGroup(groupId, state.adminPin);
    if (res.success) {
      showToast('הקבוצה נמחקה בהצלחה', 'success');
      closeModal(groupAdminModal);
      loadGroups();
      loadStats();
    } else {
      showToast(res.error, 'error');
    }
    return;
  }

  try {
    const res = await fetch(`/api/groups/${groupId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: state.adminPin })
    });
    const data = await res.json();
    if (data.success) {
      showToast('הקבוצה נמחקה בהצלחה', 'success');
      closeModal(groupAdminModal);
      loadGroups();
      loadStats();
    } else {
      showToast(data.error || 'שגיאה במחיקת הקבוצה', 'error');
    }
  } catch (err) {
    const res = LocalDB.deleteGroup(groupId, state.adminPin);
    showToast('הקבוצה נמחקה בהצלחה', 'success');
    closeModal(groupAdminModal);
    loadGroups();
    loadStats();
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
  confirmBtn.textContent = 'מוחק...';

  if (isStaticEnv) {
    const res = LocalDB.deletePost(postId, pin);
    if (res.success) {
      showToast('המודעה הוסרה בהצלחה מהלוח', 'success');
      closeModal(deletePostModal);
      loadStats();
      loadPosts();
    } else {
      showToast(res.error, 'error');
    }
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'מחק מודעה';
    return;
  }

  try {
    const res = await fetch(`/api/posts/${postId}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();

    if (data.success) {
      showToast('המודעה הוסרה בהצלחה מהלוח', 'success');
      closeModal(deletePostModal);
      await loadStats();
      await loadPosts();
    } else {
      showToast(data.error || 'קוד סודי שגוי או שהמודעה לא נמצאה', 'error');
    }
  } catch (err) {
    const res = LocalDB.deletePost(postId, pin);
    if (res.success) {
      showToast('המודעה הוסרה בהצלחה מהלוח', 'success');
      closeModal(deletePostModal);
      loadStats();
      loadPosts();
    } else {
      showToast('קוד סודי שגוי', 'error');
    }
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
