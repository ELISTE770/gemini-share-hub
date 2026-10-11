const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');

// ודא שתיקיית data קיימת
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'gemini_share.db');
const db = new DatabaseSync(dbPath);

// הגדרות WAL לביצועים ואמינות
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('offer', 'request')),
    name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    forum_user TEXT,
    cost_type TEXT NOT NULL CHECK(cost_type IN ('free', 'paid')),
    notes TEXT,
    pin_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    manager_email TEXT NOT NULL,
    manager_phone TEXT,
    manager_forum_user TEXT,
    has_discount INTEGER NOT NULL DEFAULT 0,
    discount_label TEXT,
    cost_per_member TEXT,
    total_slots INTEGER NOT NULL DEFAULT 6,
    require_approval INTEGER NOT NULL DEFAULT 0,
    private_members INTEGER NOT NULL DEFAULT 0,
    requirements TEXT,
    prepay_required INTEGER NOT NULL DEFAULT 0,
    prepay_months INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    pin_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'full', 'closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    member_email TEXT NOT NULL,
    member_phone TEXT,
    member_forum_user TEXT,
    status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved', 'pending')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_status_type ON posts(status, type);
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
  CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);
  CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at);
  CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_unique ON group_members(group_id, lower(member_email));
`);

// מיגרציות עדינות להוספת עמודות חדשות אם הטבלאות כבר נוצרו בעבר
const migrations = [
  `ALTER TABLE posts ADD COLUMN forum_user TEXT;`,
  `ALTER TABLE groups ADD COLUMN manager_forum_user TEXT;`,
  `ALTER TABLE groups ADD COLUMN require_approval INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE groups ADD COLUMN private_members INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE groups ADD COLUMN requirements TEXT;`,
  `ALTER TABLE groups ADD COLUMN prepay_required INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE groups ADD COLUMN prepay_months INTEGER NOT NULL DEFAULT 1;`,
  `ALTER TABLE group_members ADD COLUMN member_forum_user TEXT;`,
  `ALTER TABLE group_members ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';`
];

for (const mig of migrations) {
  try {
    db.exec(mig);
  } catch (e) {
    // עמודה כבר קיימת - תקין לחלוטין
  }
}

/**
 * שליפת מודעות פעילות עם סינונים
 */
function getPosts(filters = {}) {
  const { type, cost_type, search } = filters;
  let query = `
    SELECT id, type, name, email, forum_user, cost_type, notes, status, created_at
    FROM posts
    WHERE status = 'active'
  `;
  const params = [];

  if (type && (type === 'offer' || type === 'request')) {
    query += ` AND type = ?`;
    params.push(type);
  }

  if (cost_type && (cost_type === 'free' || cost_type === 'paid')) {
    query += ` AND cost_type = ?`;
    params.push(cost_type);
  }

  if (search && search.trim()) {
    query += ` AND (notes LIKE ? OR email LIKE ? OR name LIKE ? OR forum_user LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY id DESC LIMIT 100`;

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * יצירת מודעה חדשה
 */
function createPost(data) {
  const { type, name, email, forum_user, cost_type, notes, pin } = data;

  if (!type || !['offer', 'request'].includes(type)) {
    throw new Error('סוג מודעה לא תקין (חובה לבחור מציע או מחפש)');
  }
  if (!email || !email.includes('@')) {
    throw new Error('כתובת אימייל לא תקינה');
  }
  if (!cost_type || !['free', 'paid'].includes(cost_type)) {
    throw new Error('סוג עלות לא תקין (חינם או חלוקת עלויות)');
  }
  if (!pin || pin.toString().trim().length < 4) {
    throw new Error('קוד מחיקה (PIN) חייב להכיל לפחות 4 תווים');
  }

  const cleanPin = pin.toString().trim();
  const pinHash = bcrypt.hashSync(cleanPin, 8);

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name || '').trim().slice(0, 50);
  const cleanForumUser = (forum_user || '').trim().replace(/^@/, '').slice(0, 40);
  const cleanNotes = (notes || '').trim().slice(0, 500);

  const stmt = db.prepare(`
    INSERT INTO posts (type, name, email, forum_user, cost_type, notes, pin_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(type, cleanName, cleanEmail, cleanForumUser || null, cost_type, cleanNotes, pinHash);
  const newId = Number(result.lastInsertRowid);

  const getStmt = db.prepare(`
    SELECT id, type, name, email, forum_user, cost_type, notes, status, created_at
    FROM posts WHERE id = ?
  `);
  return getStmt.get(newId);
}

/**
 * מחיקת מודעה באמצעות אימות PIN
 */
function deletePost(id, pin) {
  const post = db.prepare(`SELECT id, pin_hash FROM posts WHERE id = ?`).get(Number(id));
  if (!post) {
    return { success: false, status: 404, message: 'המודעה לא נמצאה או שכבר נמחקה' };
  }

  const isValidPin = bcrypt.compareSync(String(pin || '').trim(), post.pin_hash);
  if (!isValidPin) {
    return { success: false, status: 401, message: 'קוד סודי (PIN) שגוי' };
  }

  db.prepare(`DELETE FROM posts WHERE id = ?`).run(Number(id));
  return { success: true, message: 'המודעה נמחקה בהצלחה' };
}

/**
 * סימון מודעה כנסגרה
 */
function closePost(id, pin) {
  const post = db.prepare(`SELECT id, pin_hash FROM posts WHERE id = ?`).get(Number(id));
  if (!post) {
    return { success: false, status: 404, message: 'המודעה לא נמצאה' };
  }

  const isValidPin = bcrypt.compareSync(String(pin || '').trim(), post.pin_hash);
  if (!isValidPin) {
    return { success: false, status: 401, message: 'קוד סודי (PIN) שגוי' };
  }

  db.prepare(`UPDATE posts SET status = 'closed', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(Number(id));
  return { success: true, message: 'המודעה סומנה כנסגרה בהצלחה' };
}

/**
 * שליפת קבוצות שיתוף עלויות עם סינונים
 */
function getGroups(filters = {}) {
  const { status, has_discount, search } = filters;
  let query = `
    SELECT id, title, manager_name, manager_email, manager_forum_user, has_discount,
           discount_label, cost_per_member, total_slots, require_approval,
           private_members, requirements, prepay_required, prepay_months,
           notes, status, created_at, updated_at
    FROM groups
    WHERE 1=1
  `;
  const params = [];

  if (status && ['open', 'full', 'closed'].includes(status)) {
    query += ` AND status = ?`;
    params.push(status);
  } else if (!status || status === 'active') {
    query += ` AND status IN ('open', 'full')`;
  }

  if (has_discount === 'true' || has_discount === '1' || has_discount === true) {
    query += ` AND has_discount = 1`;
  }

  if (search && search.trim()) {
    query += ` AND (title LIKE ? OR notes LIKE ? OR manager_name LIKE ? OR manager_email LIKE ? OR manager_forum_user LIKE ? OR discount_label LIKE ? OR requirements LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term, term, term);
  }

  query += ` ORDER BY id DESC LIMIT 100`;

  const stmt = db.prepare(query);
  const groups = stmt.all(...params);

  const getMembersStmt = db.prepare(`
    SELECT id, member_name, member_email, member_forum_user, status, notes, created_at
    FROM group_members
    WHERE group_id = ?
    ORDER BY id ASC
  `);

  return groups.map(g => {
    const allMembers = getMembersStmt.all(g.id);
    const approvedMembers = allMembers.filter(m => m.status === 'approved');
    const pendingCount = allMembers.filter(m => m.status === 'pending').length;

    const members_count = approvedMembers.length;
    const slots_taken = 1 + members_count; // מנהל + חברים שאושרו
    const slots_free = Math.max(0, g.total_slots - slots_taken);
    const needed_members = Math.max(0, (g.total_slots - 1) - members_count);

    // חיסיון משתתפים לאורחים ציבוריים
    let publicMembers = approvedMembers;
    if (g.private_members === 1) {
      publicMembers = approvedMembers.map((m, idx) => ({
        id: m.id,
        member_name: `חבר קבוצה #${idx + 1}`,
        member_email: '*** חסוי ***',
        member_forum_user: m.member_forum_user ? '***' : null,
        status: m.status,
        created_at: m.created_at
      }));
    }

    return {
      ...g,
      has_discount: Boolean(g.has_discount),
      require_approval: Boolean(g.require_approval),
      private_members: Boolean(g.private_members),
      prepay_required: Boolean(g.prepay_required),
      members: publicMembers,
      members_count,
      pending_count: pendingCount,
      slots_taken,
      slots_free,
      needed_members
    };
  });
}

/**
 * שליפת קבוצה בודדת לפי מזהה (כולל חיסיון אם מוגדר)
 */
function getGroupById(id, includePrivate = false) {
  const stmt = db.prepare(`
    SELECT id, title, manager_name, manager_email, manager_forum_user, has_discount,
           discount_label, cost_per_member, total_slots, require_approval,
           private_members, requirements, prepay_required, prepay_months,
           notes, status, created_at, updated_at
    FROM groups
    WHERE id = ?
  `);
  const group = stmt.get(Number(id));
  if (!group) return null;

  const allMembers = db.prepare(`
    SELECT id, member_name, member_email, member_forum_user, status, notes, created_at
    FROM group_members
    WHERE group_id = ?
    ORDER BY id ASC
  `).all(group.id);

  const approvedMembers = allMembers.filter(m => m.status === 'approved');
  const pendingMembers = allMembers.filter(m => m.status === 'pending');

  const members_count = approvedMembers.length;
  const slots_taken = 1 + members_count;
  const slots_free = Math.max(0, group.total_slots - slots_taken);
  const needed_members = Math.max(0, (group.total_slots - 1) - members_count);

  let displayedMembers = approvedMembers;
  if (group.private_members === 1 && !includePrivate) {
    displayedMembers = approvedMembers.map((m, idx) => ({
      id: m.id,
      member_name: `חבר קבוצה #${idx + 1}`,
      member_email: '*** חסוי ***',
      member_forum_user: m.member_forum_user ? '***' : null,
      status: m.status,
      created_at: m.created_at
    }));
  }

  return {
    ...group,
    has_discount: Boolean(group.has_discount),
    require_approval: Boolean(group.require_approval),
    private_members: Boolean(group.private_members),
    prepay_required: Boolean(group.prepay_required),
    members: includePrivate ? allMembers : displayedMembers,
    pending_members: includePrivate ? pendingMembers : [],
    members_count,
    pending_count: pendingMembers.length,
    slots_taken,
    slots_free,
    needed_members
  };
}

/**
 * יצירת קבוצה חדשה לחלוקת עלויות (מנהל + עד 5 שותפים)
 */
function createGroup(data) {
  const {
    title,
    manager_name,
    manager_email,
    manager_forum_user,
    has_discount,
    discount_label,
    cost_per_member,
    total_slots,
    require_approval,
    private_members,
    requirements,
    prepay_required,
    prepay_months,
    notes,
    pin
  } = data;

  if (!manager_name || !manager_name.trim()) {
    throw new Error('שם מנהל הקבוצה הוא שדה חובה');
  }
  if (!manager_email || !manager_email.includes('@')) {
    throw new Error('כתובת אימייל לא תקינה');
  }
  if (!pin || pin.toString().trim().length < 4) {
    throw new Error('קוד ניהול (PIN) חייב להכיל לפחות 4 תווים');
  }

  const cleanPin = pin.toString().trim();
  const pinHash = bcrypt.hashSync(cleanPin, 8);

  const cleanName = manager_name.trim().slice(0, 50);
  const cleanEmail = manager_email.trim().toLowerCase();
  const cleanForumUser = (manager_forum_user || '').trim().replace(/^@/, '').slice(0, 40);
  const hasDiscountNum = (has_discount === true || has_discount === '1' || has_discount === 1) ? 1 : 0;
  const cleanDiscountLabel = (discount_label || '').trim().slice(0, 60);
  const cleanCost = (cost_per_member || '').trim().slice(0, 40);
  const cleanNotes = (notes || '').trim().slice(0, 500);

  const reqApprovalNum = (require_approval === true || require_approval === '1' || require_approval === 1) ? 1 : 0;
  const privMembersNum = (private_members === true || private_members === '1' || private_members === 1) ? 1 : 0;
  const cleanRequirements = (requirements || '').trim().slice(0, 500);
  const prepayReqNum = (prepay_required === true || prepay_required === '1' || prepay_required === 1) ? 1 : 0;
  let prepayMonthsNum = Number(prepay_months) || 1;
  if (prepayMonthsNum < 1) prepayMonthsNum = 1;
  if (prepayMonthsNum > 24) prepayMonthsNum = 24;

  let slots = Number(total_slots) || 6;
  if (slots < 2) slots = 2;
  if (slots > 10) slots = 10;

  let groupTitle = (title || '').trim().slice(0, 100);
  const discTag = cleanDiscountLabel || 'מחיר מוזל (סטודנט וכו\')';

  if (!groupTitle) {
    if (hasDiscountNum) {
      groupTitle = `🎓 [${discTag}] קבוצת שיתוף — ${cleanName}`;
    } else {
      groupTitle = `👥 קבוצת שיתוף עלויות — ${cleanName}`;
    }
  } else if (hasDiscountNum && !groupTitle.includes('🎓') && !groupTitle.includes(discTag)) {
    groupTitle = `🎓 [${discTag}] ${groupTitle}`;
  }

  const stmt = db.prepare(`
    INSERT INTO groups (
      title, manager_name, manager_email, manager_forum_user, has_discount,
      discount_label, cost_per_member, total_slots, require_approval,
      private_members, requirements, prepay_required, prepay_months,
      notes, pin_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    groupTitle,
    cleanName,
    cleanEmail,
    cleanForumUser || null,
    hasDiscountNum,
    cleanDiscountLabel || (hasDiscountNum ? 'מחיר מוזל (סטודנט וכו\')' : null),
    cleanCost,
    slots,
    reqApprovalNum,
    privMembersNum,
    cleanRequirements || null,
    prepayReqNum,
    prepayMonthsNum,
    cleanNotes,
    pinHash
  );

  const newId = Number(result.lastInsertRowid);
  return getGroupById(newId, false);
}

/**
 * הצטרפות של משתתף לקבוצה
 */
function joinGroup(groupId, memberData) {
  const group = getGroupById(groupId, true);
  if (!group) {
    throw new Error('הקבוצה המבוקשת לא נמצאה');
  }
  if (group.status === 'closed') {
    throw new Error('קבוצה זו סגורה ואינה מקבלת חברים נוספים');
  }
  if (group.slots_free <= 0 || group.status === 'full') {
    throw new Error('כל המקומות בקבוצה זו נתפסו');
  }

  const { member_name, member_email, member_forum_user, notes } = memberData;
  if (!member_name || !member_name.trim()) {
    throw new Error('נא להזין שם או כינוי');
  }
  if (!member_email || !member_email.includes('@')) {
    throw new Error('כתובת אימייל לא תקינה');
  }

  const cleanName = member_name.trim().slice(0, 50);
  const cleanEmail = member_email.trim().toLowerCase();
  const cleanForumUser = (member_forum_user || '').trim().replace(/^@/, '').slice(0, 40);
  const cleanNotes = (notes || '').trim().slice(0, 300);

  // מניעת כפילויות
  if (cleanEmail === group.manager_email.toLowerCase()) {
    throw new Error('כתובת המייל הזו היא של מנהל הקבוצה');
  }
  if (group.members.some(m => m.member_email.toLowerCase() === cleanEmail)) {
    throw new Error('כתובת מייל זו כבר נרשמה לקבוצה זו');
  }

  // סטטוס התחלתי: אם דורש אישור מנהל -> pending, אחרת -> approved
  const initialStatus = group.require_approval ? 'pending' : 'approved';

  if (initialStatus === 'approved') {
    const currentApprovedCount = db.prepare(`SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'`).get(group.id).cnt;
    if (1 + currentApprovedCount >= group.total_slots) {
      throw new Error('כל המקומות בקבוצה זו נתפסו');
    }
  }

  const insertStmt = db.prepare(`
    INSERT INTO group_members (group_id, member_name, member_email, member_forum_user, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(group.id, cleanName, cleanEmail, cleanForumUser || null, initialStatus, cleanNotes);

  // עדכון סטטוס קבוצה אם התמלאה
  if (initialStatus === 'approved') {
    const updatedApprovedCount = db.prepare(`SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'`).get(group.id).cnt;
    if (1 + updatedApprovedCount >= group.total_slots) {
      db.prepare(`UPDATE groups SET status = 'full', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(group.id);
    }
  }

  return {
    group: getGroupById(group.id, false),
    isPending: initialStatus === 'pending',
    message: initialStatus === 'pending'
      ? 'בקשתך נרשמה בהצלחה וממתינה לאישור מנהל הקבוצה'
      : 'הצטרפת לקבוצה בהצלחה!'
  };
}

/**
 * מנהל: אישור חבר ממתין
 */
function approveGroupMember(groupId, memberId, pin) {
  const group = db.prepare(`SELECT id, pin_hash, total_slots FROM groups WHERE id = ?`).get(Number(groupId));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  const member = db.prepare(`SELECT id, status FROM group_members WHERE id = ? AND group_id = ?`).get(Number(memberId), Number(groupId));
  if (!member) return { success: false, status: 404, message: 'המשתתף לא נמצא' };

  const currentApproved = db.prepare(`SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'`).get(Number(groupId)).cnt;
  if (1 + currentApproved >= group.total_slots) {
    return { success: false, status: 400, message: 'הקבוצה מלאה, לא ניתן לאשר חברים נוספים' };
  }

  db.prepare(`UPDATE group_members SET status = 'approved' WHERE id = ?`).run(Number(memberId));

  const newCount = 1 + currentApproved + 1;
  if (newCount >= group.total_slots) {
    db.prepare(`UPDATE groups SET status = 'full', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(Number(groupId));
  }

  return { success: true, message: 'המשתתף אושר בהצלחה ונוסף לקבוצה' };
}

/**
 * מנהל: דחיית חבר ממתין או הסרת חבר קיים
 */
function removeGroupMember(groupId, memberId, pin) {
  const group = db.prepare(`SELECT id, pin_hash, total_slots FROM groups WHERE id = ?`).get(Number(groupId));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  const member = db.prepare(`SELECT id FROM group_members WHERE id = ? AND group_id = ?`).get(Number(memberId), Number(groupId));
  if (!member) return { success: false, status: 404, message: 'המשתתף לא נמצא בקבוצה' };

  db.prepare(`DELETE FROM group_members WHERE id = ? AND group_id = ?`).run(Number(memberId), Number(groupId));

  // אם הקבוצה הייתה מלאה ויש מקום - נחזיר אותה ל-open
  const approvedCount = db.prepare(`SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'`).get(Number(groupId)).cnt;
  if (1 + approvedCount < group.total_slots) {
    db.prepare(`UPDATE groups SET status = 'open', updated_at = datetime('now', 'localtime') WHERE id = ? AND status = 'full'`).run(Number(groupId));
  }

  return { success: true, message: 'המשתתף הוסר מהקבוצה בהצלחה' };
}

/**
 * שליפת פרטי קבוצה מלאים עבור מנהל (עם PIN)
 */
function getGroupAdminDetails(groupId, pin) {
  const group = db.prepare(`SELECT id, pin_hash FROM groups WHERE id = ?`).get(Number(groupId));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  const fullGroup = getGroupById(groupId, true);
  return { success: true, group: fullGroup };
}

/**
 * סגירת קבוצה עם אימות PIN של המנהל
 */
function closeGroup(id, pin) {
  const group = db.prepare(`SELECT id, pin_hash FROM groups WHERE id = ?`).get(Number(id));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  db.prepare(`UPDATE groups SET status = 'closed', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(Number(id));
  return { success: true, message: 'הקבוצה סומנה כנסגרה בהצלחה' };
}

/**
 * פתיחה מחדש של קבוצה עם אימות PIN של המנהל
 */
function reopenGroup(id, pin) {
  const group = db.prepare(`SELECT id, pin_hash, total_slots FROM groups WHERE id = ?`).get(Number(id));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  const approvedCount = db.prepare(`SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'`).get(Number(id)).cnt;
  const newStatus = (1 + approvedCount >= group.total_slots) ? 'full' : 'open';

  db.prepare(`UPDATE groups SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(newStatus, Number(id));
  return { success: true, message: 'הקבוצה נפתחה מחדש בהצלחה', status: newStatus };
}

/**
 * מחיקת קבוצה באמצעות אימות PIN
 */
function deleteGroup(id, pin) {
  const group = db.prepare(`SELECT id, pin_hash FROM groups WHERE id = ?`).get(Number(id));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  db.prepare(`DELETE FROM groups WHERE id = ?`).run(Number(id));
  return { success: true, message: 'הקבוצה נמחקה בהצלחה' };
}

/**
 * אימות קוד ניהול (PIN) של הקבוצה
 */
function verifyGroupPin(id, pin) {
  const group = db.prepare(`SELECT id, pin_hash FROM groups WHERE id = ?`).get(Number(id));
  if (!group) return { success: false, status: 404, message: 'הקבוצה לא נמצאה' };

  if (!bcrypt.compareSync(String(pin || '').trim(), group.pin_hash)) {
    return { success: false, status: 401, message: 'קוד ניהול (PIN) שגוי' };
  }

  return { success: true };
}

/**
 * סטטיסטיקות כלליות לאתר
 */
function getStats() {
  const activeOffers = db.prepare(`SELECT COUNT(*) as count FROM posts WHERE status = 'active' AND type = 'offer'`).get().count;
  const activeRequests = db.prepare(`SELECT COUNT(*) as count FROM posts WHERE status = 'active' AND type = 'request'`).get().count;
  const activeGroups = db.prepare(`SELECT COUNT(*) as count FROM groups WHERE status IN ('open', 'full')`).get().count;
  const totalGroupMembers = db.prepare(`SELECT COUNT(*) as count FROM group_members WHERE status = 'approved'`).get().count;
  const closedGroups = db.prepare(`SELECT COUNT(*) as count FROM groups WHERE status = 'closed'`).get().count;
  const closedPosts = db.prepare(`SELECT COUNT(*) as count FROM posts WHERE status = 'closed'`).get().count;
  const completed = Number(closedGroups) + Number(closedPosts);

  return {
    offers: Number(activeOffers),
    requests: Number(activeRequests),
    groups: Number(activeGroups),
    groupMembers: Number(totalGroupMembers),
    completed: Number(completed)
  };
}

module.exports = {
  db,
  getPosts,
  createPost,
  deletePost,
  closePost,
  getGroups,
  getGroupById,
  createGroup,
  joinGroup,
  approveGroupMember,
  removeGroupMember,
  getGroupAdminDetails,
  closeGroup,
  reopenGroup,
  deleteGroup,
  verifyGroupPin,
  getStats
};
