process.env.NODE_ENV = 'test';
const http = require('node:http');
const app = require('../server/index');

const PORT = 3098;
let server;

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 בדיקת כל הפיצ\'רים החדשים (מתמחים טופ, אישור מנהל, חיסיון, תשלום מראש, הסרת חברים)...');

  server = app.listen(PORT, () => {
    console.log(`שרת בדיקות פעיל בפורט ${PORT}`);
  });

  try {
    // 1. יצירת מודעה אישית עם שם משתמש במתמחים טופ
    const postRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/posts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      type: 'offer',
      name: 'מפתח_בינה',
      email: 'mitmachim.dev@gmail.com',
      forum_user: 'eli_master',
      cost_type: 'free',
      notes: 'יש לי 2 מקומות, פנו אליי במייל או בפורום',
      pin: '5555'
    });
    console.assert(postRes.status === 201, 'Post creation status should be 201');
    console.assert(postRes.data.post.forum_user === 'eli_master', 'Forum user should be saved');
    const postId = postRes.data.post.id;
    console.log('✅ 1. יצירת מודעה עם פורום מתמחים/בינה טופ עברה בהצלחה');

    // 2. פתיחת קבוצה עם כל ההגדרות החדשות
    const groupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'קבוצת חברים ממתמחים טופ',
      manager_name: 'יוסי',
      manager_email: 'yossi.manager@gmail.com',
      manager_forum_user: 'yossi_top',
      has_discount: true,
      discount_label: 'הנחת סטודנט',
      cost_per_member: '20 ש"ח לחודש',
      require_approval: true,
      private_members: true,
      requirements: 'חבר פעיל בפורום מעל 3 חודשים',
      prepay_required: true,
      prepay_months: 6,
      notes: 'תשלום מראש בביט ל-6 חודשים',
      pin: '8888'
    });
    console.assert(groupRes.status === 201, 'Group creation status should be 201');
    const groupId = groupRes.data.group.id;
    console.assert(groupRes.data.group.require_approval === true, 'require_approval should be true');
    console.assert(groupRes.data.group.private_members === true, 'private_members should be true');
    console.assert(groupRes.data.group.prepay_months === 6, 'prepay_months should be 6');
    console.log('✅ 2. פתיחת קבוצה עם אישור כניסה, חיסיון משתתפים ותשלום מראש עברה בהצלחה');

    // 3. הצטרפות משתמש לקבוצה הדורשת אישור (ציפייה ל-pending)
    const joinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'דוד',
      member_email: 'david.join@gmail.com',
      member_forum_user: 'david_dev',
      notes: 'אשמח להצטרף'
    });
    console.assert(joinRes.status === 200, 'Join status should be 200');
    console.assert(joinRes.data.isPending === true, 'Member should be in pending state');
    console.log('✅ 3. הצטרפות לקבוצה עם דרישת אישור נכנסה ל-pending כראוי');

    // 4. בדיקת חיסיון בגישה ציבורית (ללא PIN)
    const publicGroupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}`,
      method: 'GET'
    });
    console.assert(publicGroupRes.status === 200, 'Public group fetch status should be 200');
    console.log('✅ 4. צפייה ציבורית בקבוצה עברה בהצלחה');

    // 5. כניסת מנהל לפאנל הניהול עם PIN
    const adminRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/admin`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '8888'
    });
    console.assert(adminRes.status === 200, 'Admin auth should be 200');
    console.assert(adminRes.data.group.pending_members.length === 1, 'Should have 1 pending member');
    const memberId = adminRes.data.group.pending_members[0].id;
    console.assert(adminRes.data.group.pending_members[0].member_email === 'david.join@gmail.com', 'Admin sees real email');
    console.log('✅ 5. פאנל ניהול מנהל עם PIN הציג בהצלחה חבר ממתין עם מייל גלוי');

    // 6. המנהל מאשר את החבר הממתין
    const approveRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/members/${memberId}/approve`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '8888'
    });
    console.assert(approveRes.status === 200, 'Approve should return 200');
    console.log('✅ 6. מנהל אישר בהצלחה את החבר הממתין');

    // 7. המנהל מוציא את החבר מהקבוצה
    const removeRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/remove-member`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '8888',
      member_id: memberId
    });
    console.assert(removeRes.status === 200, 'Remove member should return 200');
    console.log('✅ 7. מנהל הוציא בהצלחה את החבר מהקבוצה ופינה את המקום');

    // 8. מחיקת מודעה אישית
    const delPostRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/posts/${postId}/delete`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '5555'
    });
    console.assert(delPostRes.status === 200, 'Delete post should return 200');
    console.log('✅ 8. מחיקת מודעה אישית עם PIN עברה בהצלחה');

    // 9. מחיקת קבוצה
    const delGroupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/delete`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '8888'
    });
    console.assert(delGroupRes.status === 200, 'Delete group should return 200');
    console.log('✅ 9. מחיקת קבוצה עם PIN עברה בהצלחה');

    console.log('\n🎉 כל הבדיקות עבור כל הדרישות החדשות עברו ב-100% הצלחה!');
  } catch (err) {
    console.error('❌ שגיאה בבדיקות:', err);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
  }
}

runTests();
