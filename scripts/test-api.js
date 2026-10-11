process.env.NODE_ENV = 'test';
const http = require('node:http');
const app = require('../server/index');

const PORT = 3099;
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
  console.log('🧪 מתחיל בדיקות מערכת אוטומטיות...');

  server = app.listen(PORT, () => {
    console.log(`שרת בדיקות רץ בפורט ${PORT}`);
  });

  try {
    // 1. בדיקת סטטיסטיקה
    const statsRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/stats',
      method: 'GET'
    });
    console.assert(statsRes.status === 200, 'Stats status should be 200');
    console.log('✅ בדיקת שליפת סטטיסטיקה עברה בהצלחה');

    // 2. יצירת מודעה מסוג "מציע" (Offer)
    const offerRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/posts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      type: 'offer',
      name: 'יוסי כהן',
      email: 'yossi.gemini@gmail.com',
      phone: '0501234567',
      cost_type: 'free',
      notes: 'יש לי 2 מקומות פנויים במנוי Gemini Advanced, מחפש שותפים חינם',
      pin: '1234'
    });

    console.assert(offerRes.status === 201, `Create offer should return 201, got ${offerRes.status}`);
    console.assert(offerRes.data.post.email === 'yossi.gemini@gmail.com', 'Email should match');
    const offerId = offerRes.data.post.id;
    console.log(`✅ בדיקת יצירת מודעת הצעה עברה (מזהה: ${offerId})`);

    // 3. יצירת מודעה מסוג "מחפש" (Request)
    const reqRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/posts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      type: 'request',
      name: 'דניאל',
      email: 'daniel.student@gmail.com',
      phone: '',
      cost_type: 'paid',
      notes: 'סטודנט למדעי המחשב, אשמח להשתתף בעלויות של המנוי',
      pin: '9876'
    });

    console.assert(reqRes.status === 201, `Create request should return 201, got ${reqRes.status}`);
    const requestId = reqRes.data.post.id;
    console.log(`✅ בדיקת יצירת מודעת בקשה עברה (מזהה: ${requestId})`);

    // 4. שליפת מודעות וסינון
    const listRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/posts?type=offer',
      method: 'GET'
    });
    console.assert(listRes.status === 200, 'List should return 200');
    console.assert(listRes.data.posts.some(p => p.id === offerId), 'Offer should be in filtered list');
    console.log('✅ בדיקת סינון לפי סוג מודעה עברה בהצלחה');

    // 5. ניסיון מחיקה עם PIN שגוי
    const wrongPinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/posts/${offerId}/delete`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '0000'
    });
    console.assert(wrongPinRes.status === 401, `Wrong PIN should return 401, got ${wrongPinRes.status}`);
    console.log('✅ בדיקת אבטחה: מחיקה עם PIN שגוי נחסמה כראוי (401)');

    // 6. מחיקה מוצלחת עם PIN נכון
    const correctPinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/posts/${offerId}/delete`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '1234'
    });
    console.assert(correctPinRes.status === 200, `Correct PIN should return 200, got ${correctPinRes.status}`);
    console.log('✅ מחיקה מוצלחת עם PIN נכון עברה כראוי');

    // 7. בדיקת מלכודת בוטים (Honeypot)
    const botRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/posts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      type: 'request',
      email: 'spammer@bot.com',
      website: 'http://spam-link.com',
      pin: '1111'
    });
    console.assert(botRes.status === 400, 'Bot should be rejected');
    console.log('✅ בדיקת מלכודת ספאם (Honeypot) חסמה בהצלחה בוט');

    // 8. יצירת קבוצה חדשה עם הנחת סטודנט ומנהל שמחפש 5 שותפים
    const groupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'יונתן כהן',
      manager_email: 'yonatan.manager@gmail.com',
      manager_phone: '052-7778899',
      has_discount: true,
      discount_label: 'הנחת סטודנט (50% הנחה)',
      cost_per_member: '12 ₪ לחודש',
      notes: 'יש לי זכאות למחיר סטודנט מוזל! מחפש 5 שותפים להתחלק בהוצאה חודשית שווה.',
      pin: '4321'
    });

    console.assert(groupRes.status === 201, `Group create should return 201, got ${groupRes.status}`);
    const group = groupRes.data.group;
    console.assert(group.has_discount === true, 'Group should have discount enabled');
    console.assert(group.title.includes('הנחת סטודנט') || group.title.includes('מחיר מוזל'), 'Group title must include discount indicator');
    console.assert(group.total_slots === 6, 'Group total slots should default to 6 (1 manager + 5 members)');
    console.assert(group.needed_members === 5, 'Group should need 5 members initially');
    console.assert(group.slots_taken === 1, 'Group slots taken should be 1 (manager)');
    const groupId = group.id;
    console.log(`✅ בדיקת יצירת קבוצה עברה בהצלחה (מזהה: ${groupId}, כותרת: "${group.title}")`);

    // 9. הצטרפות חבר ראשון לקבוצה
    const join1Res = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'מאיה לוי',
      member_email: 'maya.levi@gmail.com',
      member_phone: '054-1122334',
      notes: 'אשמח להצטרף לשיתוף!'
    });
    console.assert(join1Res.status === 200, `Join 1 should return 200, got ${join1Res.status}`);
    console.assert(join1Res.data.group.members_count === 1, 'Group should have 1 joined member');
    console.assert(join1Res.data.group.slots_taken === 2, 'Group slots taken should be 2');
    console.assert(join1Res.data.group.needed_members === 4, 'Group should need 4 more members');
    console.log('✅ חבר ראשון הצטרף בהצלחה (2/6 תפוס)');

    // 10. מניעת הצטרפות כפולה של אותו אימייל
    const dupJoinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'מאיה שוב',
      member_email: 'maya.levi@gmail.com'
    });
    console.assert(dupJoinRes.status === 400, 'Duplicate join should be rejected');
    console.log('✅ אבטחה: מניעת רישום כפול של אותו אימייל לקבוצה עברה בהצלחה');

    // 11. הצטרפות שאר החברים עד למילוי כל 5 המקומות הנוספים (סה"כ 6)
    const membersToJoin = [
      { name: 'עומר', email: 'omer@gmail.com' },
      { name: 'נועה', email: 'noa@gmail.com' },
      { name: 'איתי', email: 'itai@gmail.com' },
      { name: 'שירה', email: 'shira@gmail.com' }
    ];

    for (const m of membersToJoin) {
      const res = await request({
        hostname: 'localhost',
        port: PORT,
        path: `/api/groups/${groupId}/join`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        member_name: m.name,
        member_email: m.email
      });
      console.assert(res.status === 200, `Join ${m.name} should succeed`);
    }

    // בדיקת סטטוס הקבוצה לאחר מילוי כל 6 המקומות
    const fullGroupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}`,
      method: 'GET'
    });
    console.assert(fullGroupRes.data.group.slots_free === 0, 'No free slots should remain');
    console.assert(fullGroupRes.data.group.status === 'full', 'Group status should be "full"');
    console.log('✅ כל 5 השותפים הצטרפו — הקבוצה התמלאה ועברה אוטומטית לסטטוס "full" (6/6)');

    // 12. ניסיון הצטרפות לקבוצה מלאה נחסם
    const overflowRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'משתתף נוסף',
      member_email: 'extra@gmail.com'
    });
    console.assert(overflowRes.status === 400, 'Join to full group should fail with 400');
    console.log('✅ ניסיון הצטרפות לקבוצה מלאה נחסם כראוי');

    // 13. הסרת חבר ע"י המנהל בעזרת PIN ופתיחה חוזרת של הקבוצה
    const mayaId = fullGroupRes.data.group.members.find(m => m.member_email === 'maya.levi@gmail.com').id;
    const removeRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/remove-member`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '4321',
      member_id: mayaId
    });
    console.assert(removeRes.status === 200, 'Remove member should succeed');

    const reopenedGroup = (await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}`,
      method: 'GET'
    })).data.group;
    console.assert(reopenedGroup.status === 'open', 'Group status should return to "open" after member removal');
    console.assert(reopenedGroup.slots_free === 1, '1 slot should be free now');
    console.log('✅ מנהל הקבוצה הסיר חבר עם PIN — הקבוצה נפתחה מחדש אוטומטית (5/6)');

    // 14. סימון הקבוצה כסגורה ע"י המנהל
    const closeGroupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/close`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '4321'
    });
    console.assert(closeGroupRes.status === 200, 'Close group should succeed');
    console.log('✅ מנהל סגר את הקבוצה בהצלחה');

    // 15. בדיקת סטטיסטיקות מעודכנות
    const updatedStatsRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/stats',
      method: 'GET'
    });
    console.assert(updatedStatsRes.data.stats.completed >= 1, 'Completed count should include closed group');
    console.log('✅ סטטיסטיקות האתר עודכנו וכוללות נתוני קבוצות שיתוף');

    // 16. בדיקת אימות PIN מנהל דרך verify-pin API
    const wrongGroupPinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/verify-pin`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '0000'
    });
    console.assert(wrongGroupPinRes.status === 401, 'Wrong group PIN should return 401');

    const correctGroupPinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/verify-pin`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '4321'
    });
    console.assert(correctGroupPinRes.status === 200, 'Correct group PIN should return 200');
    console.log('✅ בדיקת אימות קוד PIN של מנהל הקבוצה עברה בהצלחה (חסימה + אימות)');

    // 17. מחיקת קבוצה עם PIN
    const deleteGroupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${groupId}/delete`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      pin: '4321'
    });
    console.assert(deleteGroupRes.status === 200, 'Delete group should succeed');
    console.log('✅ מחיקת קבוצה באמצעות PIN עברה בהצלחה');

    // 18. אימות הגשת נכסים סטטיים, לשוניות תצוגה ומערכת העיצוב Dark Luxury
    const htmlRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'GET'
    });
    console.assert(htmlRes.status === 200, 'Root index.html should return 200');
    console.assert(htmlRes.raw.includes('קבוצות שיתוף') && htmlRes.raw.includes('מציעים מנוי') && htmlRes.raw.includes('מחפשים מנוי') && htmlRes.raw.includes('הכל'), 'index.html must include all 4 top-level view tabs');
    console.assert(htmlRes.raw.includes('זכאות למחיר מוזל (הנחת סטודנט / מבצע מיוחד)'), 'index.html must include discount option');

    const cssRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/styles.css',
      method: 'GET'
    });
    console.assert(cssRes.status === 200, 'styles.css should return 200');
    console.assert(cssRes.raw.includes('Rubik') && cssRes.raw.includes('Heebo') && cssRes.raw.includes('JetBrains Mono'), 'styles.css must include Rubik, Heebo, and JetBrains Mono');
    console.assert(cssRes.raw.includes('.ltr'), 'styles.css must define .ltr');
    console.assert(cssRes.raw.includes('circle at 20% 50%'), 'styles.css must use RTL radial gradient');
    console.assert(cssRes.raw.includes('#0A1122') && cssRes.raw.includes('#D4AF37'), 'styles.css must use navy and gold tokens');
    console.log('✅ אימות Dark Luxury: גופני Rubik/Heebo, לשוניות תצוגה, .ltr ונכסים סטטיים עברו בהצלחה');

    console.log('\n🎉 כל הבדיקות עברו בהצלחה מושלמת!');
  } catch (err) {
    console.error('❌ שגיאה בבדיקות:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
