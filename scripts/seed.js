const db = require('../server/db');

console.log('🧹 מנקה נתוני בדיקות ומודעות ישנות ממסד הנתונים...');

// מחיקת כל הנתונים הישנים
db.db.exec(`
  DELETE FROM group_members;
  DELETE FROM groups;
  DELETE FROM posts;
  DELETE FROM sqlite_sequence WHERE name IN ('posts', 'groups', 'group_members');
`);

console.log('🌱 זורע נתוני קהילה איכותיים ונקיים...');

// 1. מודעת הצעה (Offer)
const offer = db.createPost({
  type: 'offer',
  name: 'אלי פ.',
  email: 'eli.pro.ai@gmail.com',
  forum_user: 'eli_pro',
  cost_type: 'paid',
  notes: 'מציע מקום במנוי Google One AI Premium (Gemini Advanced), פנו אליי במייל או בפורום מתמחים טופ (@eli_pro).',
  pin: '1234'
});

// 2. מודעת בקשה (Request)
const request = db.createPost({
  type: 'request',
  name: 'דוד א.',
  email: 'david.ai.tech@gmail.com',
  forum_user: 'david_ai',
  cost_type: 'paid',
  notes: 'מחפש להצטרף לשיתוף משפחתי פעיל, אשמח להשתתף בעלויות. משתמש בפורום: @david_ai.',
  pin: '1234'
});

// 3. קבוצת שיתוף עלויות (Group)
const group = db.createGroup({
  title: "קבוצת שיתוף שנתית למנויי ג'מיני, 5 מקומות פנויים, הנחת סטודנט, חלוקה שווה.",
  manager_name: 'יונתן כהן',
  manager_email: 'yonatan.gemini.ai@gmail.com',
  manager_forum_user: 'yonatan_c',
  has_discount: true,
  discount_label: 'הנחת סטודנט',
  cost_per_member: '25 ₪ לחודש (300 ₪ לשנה)',
  total_slots: 6,
  require_approval: false,
  private_members: false,
  prepay_required: false,
  notes: 'קבוצה מסודרת וקבועה למנוי שנתי של Gemini Advanced. חלוקת תשלום שווה בין 5 השותפים והמנהל דרך ביט או פייבוקס.',
  pin: '1234'
});

console.log('✅ מסד הנתונים נוקה ונזרע בהצלחה עם 3 רשומות מופתיות:');
console.log(` - הצעה #${offer.id}: ${offer.notes}`);
console.log(` - בקשה #${request.id}: ${request.notes}`);
console.log(` - קבוצה #${group.id}: ${group.title} (פנויים: ${group.slots_free}/${group.total_slots})`);
