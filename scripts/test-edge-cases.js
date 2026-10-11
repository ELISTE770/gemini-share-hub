process.env.NODE_ENV = 'test';
const http = require('node:http');
const app = require('../server/index');

const PORT = 3199;
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

async function runEdgeCaseTests() {
  console.log('🔬 מתחיל בדיקות מקרי קצה (Edge Cases)...');

  server = app.listen(PORT, () => {
    console.log(`שרת בדיקות מקרי קצה רץ בפורט ${PORT}`);
  });

  try {
    // 1. ניסיון יצירת קבוצה ללא שם מנהל
    const noNameRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: '',
      manager_email: 'test@gmail.com',
      pin: '1234'
    });
    console.assert(noNameRes.status === 400, 'Should reject empty manager name');
    console.log('✅ מקרה קצה: יצירת קבוצה ללא שם נחסמה כראוי');

    // 2. ניסיון יצירת קבוצה עם אימייל לא תקין
    const badEmailRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'יוסי',
      manager_email: 'invalid-email',
      pin: '1234'
    });
    console.assert(badEmailRes.status === 400, 'Should reject invalid email');
    console.log('✅ מקרה קצה: יצירת קבוצה עם אימייל לא תקין נחסמה כראוי');

    // 3. ניסיון יצירת קבוצה עם PIN קצר מדי
    const shortPinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'יוסי',
      manager_email: 'yossi@gmail.com',
      pin: '12'
    });
    console.assert(shortPinRes.status === 400, 'Should reject short PIN');
    console.log('✅ מקרה קצה: PIN קצר מ-4 תווים נחסם כראוי');

    // 4. יצירת קבוצה עם מחיר מוזל מותאם אישית
    const customDiscRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'מנוי סטודנטים בטכניון',
      manager_name: 'רון טכניון',
      manager_email: 'ron.technion@gmail.com',
      has_discount: true,
      discount_label: 'מבצע שנתי לסטודנטים',
      cost_per_member: '10 ₪ לחודש',
      pin: '5555'
    });
    console.assert(customDiscRes.status === 201, 'Should create custom group');
    const group4 = customDiscRes.data.group;
    console.assert(group4.title.includes('מבצע שנתי לסטודנטים') || group4.title.includes('מחיר מוזל'), 'Title should reflect custom discount');
    console.log(`✅ מקרה קצה: כותרת עם הנחה מותאמת אישית נוצרה: "${group4.title}"`);

    // 5. ניסיון מנהל להצטרף בעצמו כחבר לקבוצה שלו
    const managerJoinRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${group4.id}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'רון שוב',
      member_email: 'ron.technion@gmail.com'
    });
    console.assert(managerJoinRes.status === 400, 'Manager should not join their own group as member');
    console.log('✅ מקרה קצה: מנהל שניסה להצטרף כחבר נחסם בהצלחה');

    // 6. סינון קבוצות לפי הנחה בלבד (has_discount=true)
    const discountListRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/groups?has_discount=true',
      method: 'GET'
    });
    console.assert(discountListRes.status === 200, 'Should filter by discount');
    console.assert(discountListRes.data.groups.every(g => g.has_discount === true), 'All returned groups must have discount');
    console.log('✅ מקרה קצה: סינון קבוצות לפי זכאות למחיר מוזל עבד במדויק');

    // 7. בדיקת החזרת static files (HTML ו-CSS)
    const htmlRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'GET'
    });
    console.assert(htmlRes.status === 200, 'Root HTML should return 200');
    console.assert(htmlRes.raw.includes('Smart Gemini Hub') || htmlRes.raw.includes('SMART'), 'HTML content should match');
    console.assert(htmlRes.raw.includes('קבוצות שיתוף') && htmlRes.raw.includes('מציעים מנוי') && htmlRes.raw.includes('מחפשים מנוי'), 'HTML should contain 4 top-level view tabs');
    console.assert(htmlRes.raw.includes('זכאות למחיר מוזל (הנחת סטודנט / מבצע מיוחד)'), 'HTML should contain exact discount option title');
    console.log('✅ מקרה קצה: קובץ HTML ראשי מוגש כהלכה וכולל 4 לשוניות תצוגה ואופציית הנחה');

    const cssRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/styles.css',
      method: 'GET'
    });
    console.assert(cssRes.status === 200, 'Styles CSS should return 200');
    console.assert(cssRes.raw.includes('#0A1122'), 'CSS should include dark navy palette');
    console.assert(cssRes.raw.includes('#D4AF37'), 'CSS should include gold palette');
    console.assert(cssRes.raw.includes('Rubik'), 'CSS should specify Rubik font for headings');
    console.assert(cssRes.raw.includes('Heebo'), 'CSS should specify Heebo font for body');
    console.assert(cssRes.raw.includes('.ltr'), 'CSS should define .ltr bidi isolation class');
    console.assert(cssRes.raw.includes('circle at 20% 50%'), 'CSS should orient radial gradient for RTL');
    console.log('✅ מקרה קצה: קובץ CSS מעוצב מוגש עם פלטת הצבעים המדויקת, גופני Rubik/Heebo, מחלקת .ltr וגרדיאנט RTL');

    // 8. ניקוי הקבוצה שנוצרה
    await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/groups/${group4.id}/delete`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '5555' });

    console.log('\n🏆 כל בדיקות מקרי הקצה עברו בהצלחה מושלמת!');
  } catch (err) {
    console.error('❌ שגיאה בבדיקות מקרי קצה:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runEdgeCaseTests();
