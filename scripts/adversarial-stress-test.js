process.env.NODE_ENV = 'test';
const http = require('node:http');
const app = require('../server/index');

const PORT = 3299;
let server;

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const rawPath = options.path;
    const safePath = rawPath.includes('%') ? rawPath : encodeURI(rawPath);
    const opt = { ...options, path: safePath };
    const req = http.request(opt, (res) => {
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
    if (postData !== undefined) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: []
};

function assertTest(condition, testName, details = '') {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    testResults.failed++;
    const msg = `❌ [FAIL] ${testName}: ${details}`;
    console.error(`  ${msg}`);
    testResults.failures.push(msg);
  }
}

async function runAdversarialSuite() {
  console.log('====================================================');
  console.log('🔥 STARTING ADVERSARIAL STRESS TEST SUITE (Milestone 1)');
  console.log('====================================================\n');

  server = app.listen(PORT, () => {
    console.log(`Test server active on port ${PORT}`);
  });

  try {
    // ===============================================================
    // SUITE 1: Group Creation Edge Inputs & Validation
    // ===============================================================
    console.log('\n--- SUITE 1: Group Creation Edge Inputs ---');

    // 1.1 Missing manager_name
    const res1_1 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_email: 'test@gemini.com', pin: '1234' });
    assertTest(res1_1.status === 400 && res1_1.data.success === false,
      'Group creation fails with 400 when manager_name is missing',
      `Got status ${res1_1.status}: ${JSON.stringify(res1_1.data)}`);

    // 1.2 Empty whitespace manager_name
    const res1_2 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_name: '   ', manager_email: 'test@gemini.com', pin: '1234' });
    assertTest(res1_2.status === 400 && res1_2.data.success === false,
      'Group creation fails with 400 when manager_name is whitespace only',
      `Got status ${res1_2.status}: ${JSON.stringify(res1_2.data)}`);

    // 1.3 Missing manager_email
    const res1_3 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_name: 'מנהל בדיקה', pin: '1234' });
    assertTest(res1_3.status === 400 && res1_3.data.success === false,
      'Group creation fails with 400 when manager_email is missing',
      `Got status ${res1_3.status}: ${JSON.stringify(res1_3.data)}`);

    // 1.4 Invalid manager_email (no @)
    const res1_4 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_name: 'מנהל בדיקה', manager_email: 'not-an-email', pin: '1234' });
    assertTest(res1_4.status === 400 && res1_4.data.success === false,
      'Group creation fails with 400 when manager_email lacks @',
      `Got status ${res1_4.status}: ${JSON.stringify(res1_4.data)}`);

    // 1.5 Missing PIN
    const res1_5 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_name: 'מנהל בדיקה', manager_email: 'test@gemini.com' });
    assertTest(res1_5.status === 400 && res1_5.data.success === false,
      'Group creation fails with 400 when PIN is missing',
      `Got status ${res1_5.status}: ${JSON.stringify(res1_5.data)}`);

    // 1.6 Too short PIN (< 4 chars)
    const res1_6 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_name: 'מנהל בדיקה', manager_email: 'test@gemini.com', pin: '123' });
    assertTest(res1_6.status === 400 && res1_6.data.success === false,
      'Group creation fails with 400 when PIN has fewer than 4 chars',
      `Got status ${res1_6.status}: ${JSON.stringify(res1_6.data)}`);

    // 1.7 Whitespace-padded short PIN ("  12  ")
    const res1_7 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { manager_name: 'מנהל בדיקה', manager_email: 'test@gemini.com', pin: '  12  ' });
    assertTest(res1_7.status === 400 && res1_7.data.success === false,
      'Group creation fails with 400 when trimmed PIN is shorter than 4 chars',
      `Got status ${res1_7.status}: ${JSON.stringify(res1_7.data)}`);

    // 1.8 Zero cost input ("0", "0 ₪", free)
    const res1_8 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'מנהל חינמי',
      manager_email: 'free.manager@gemini.com',
      cost_per_member: '0 ₪',
      pin: '0000'
    });
    assertTest(res1_8.status === 201 && res1_8.data.success === true && res1_8.data.group.cost_per_member === '0 ₪',
      'Group creation succeeds with zero cost ("0 ₪")',
      `Got status ${res1_8.status}`);

    // 1.9 Extreme titles: 1,000 characters and special characters
    const longTitle = 'א'.repeat(1000);
    const res1_9 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: longTitle,
      manager_name: 'מנהל ארוך',
      manager_email: 'extreme.title@gemini.com',
      pin: '9999'
    });
    assertTest(res1_9.status === 201 && res1_9.data.success === true && res1_9.data.group.title.length <= 100,
      'Extreme title (>1000 chars) is accepted and safely truncated to <= 100 chars',
      `Title length: ${res1_9.data.group?.title?.length}`);

    // 1.10 XSS / HTML injection in title and manager_name
    const xssPayload = '<script>alert("pwned")</script>';
    const res1_10 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: xssPayload,
      manager_name: xssPayload,
      manager_email: 'xss.test@gemini.com',
      notes: '<img src=x onerror=alert(1)>',
      pin: '1234'
    });
    assertTest(res1_10.status === 201 && res1_10.data.success === true,
      'HTML/Script tags in title/notes are handled safely without DB crashes',
      `Got status ${res1_10.status}`);

    // 1.11 Honeypot spam protection: 'website' field filled
    const res1_11 = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'בוט ספאם',
      manager_email: 'bot@spam.com',
      website: 'https://spam-phishing.com/click-now',
      pin: '1234'
    });
    assertTest(res1_11.status === 400 && res1_11.data.error.includes('זוהתה פעילות אוטומטית'),
      'Honeypot filled "website" rejects group creation with 400 anti-spam response',
      `Got status ${res1_11.status}: ${JSON.stringify(res1_11.data)}`);

    // 1.12 Slot boundary clamping (slots < 2 clamped to 2, slots > 10 clamped to 10)
    const clampLowRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'מנהל מינימום',
      manager_email: 'low.slots@gemini.com',
      total_slots: 1,
      pin: '1234'
    });
    assertTest(clampLowRes.status === 201 && clampLowRes.data.group.total_slots === 2,
      'Group total_slots < 2 is safely clamped to minimum 2',
      `Result slots: ${clampLowRes.data.group?.total_slots}`);

    const clampHighRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      manager_name: 'מנהל מקסימום',
      manager_email: 'high.slots@gemini.com',
      total_slots: 99,
      pin: '1234'
    });
    assertTest(clampHighRes.status === 201 && clampHighRes.data.group.total_slots === 10,
      'Group total_slots > 10 is safely clamped to maximum 10',
      `Result slots: ${clampHighRes.data.group?.total_slots}`);

    // Clean up clamping test groups
    await request({ hostname: 'localhost', port: PORT, path: `/api/groups/${clampLowRes.data.group.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '1234' });
    await request({ hostname: 'localhost', port: PORT, path: `/api/groups/${clampHighRes.data.group.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '1234' });


    // ===============================================================
    // SUITE 2: Capacity Limits & 6th Join Rejection
    // ===============================================================
    console.log('\n--- SUITE 2: Concurrency & Capacity Limits (5 Members Max) ---');

    // Create a fresh test group specifically for capacity stress test
    const capGroupRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'קבוצת בדיקת קיבולת 5 חברים',
      manager_name: 'מנהל קיבולת',
      manager_email: 'manager.capacity@gemini.com',
      total_slots: 6, // 1 manager + 5 members
      pin: '7777'
    });
    const capGroupId = capGroupRes.data.group.id;
    assertTest(capGroupRes.status === 201 && capGroupId > 0,
      'Created target group for capacity testing (total_slots=6, 1 manager + 5 members)',
      `Group ID: ${capGroupId}`);

    // Join 5 distinct members sequentially
    const memberEmails = [
      'member1@test.com',
      'member2@test.com',
      'member3@test.com',
      'member4@test.com',
      'member5@test.com'
    ];

    let all5Joined = true;
    for (let i = 0; i < memberEmails.length; i++) {
      const jRes = await request({
        hostname: 'localhost', port: PORT, path: `/api/groups/${capGroupId}/join`, method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        member_name: `חבר ${i + 1}`,
        member_email: memberEmails[i]
      });
      if (jRes.status !== 200 || jRes.data.success !== true) {
        all5Joined = false;
        console.error(`Member ${i + 1} failed to join:`, jRes.data);
      }
    }
    assertTest(all5Joined, 'All 5 legitimate members joined successfully (1 manager + 5 members = 6 total slots occupied)');

    // Verify group state is now 'full' with 0 slots free
    const checkFullRes = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${capGroupId}`, method: 'GET'
    });
    const fullGroup = checkFullRes.data.group;
    assertTest(fullGroup.status === 'full' && fullGroup.slots_free === 0 && fullGroup.slots_taken === 6 && fullGroup.members_count === 5,
      'Group status transitioned to "full", slots_free is 0, members_count is 5',
      `status: ${fullGroup.status}, free: ${fullGroup.slots_free}, taken: ${fullGroup.slots_taken}`);

    // 2.3 Attempt 6th member join -> MUST be rejected with HTTP 400
    const sixthJoinRes = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${capGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'חבר שישי שנדחה',
      member_email: 'member6.overflow@test.com'
    });
    assertTest(sixthJoinRes.status === 400 && sixthJoinRes.data.success === false,
      'Attempting 6th join is strictly rejected with HTTP 400',
      `Got status ${sixthJoinRes.status}: ${JSON.stringify(sixthJoinRes.data)}`);

    // 2.4 Race Condition / Concurrency Stress Test on Capacity
    // Create a new group with only 2 member slots (total_slots: 3 = 1 manager + 2 members)
    const raceGroupRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'קבוצת מירוץ תהליכים',
      manager_name: 'מנהל מירוץ',
      manager_email: 'race.manager@gemini.com',
      total_slots: 3, // 1 manager + 2 members
      pin: '8888'
    });
    const raceGroupId = raceGroupRes.data.group.id;

    // Fire 6 concurrent join requests simultaneously
    const concurrentJoins = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(num =>
        request({
          hostname: 'localhost', port: PORT, path: `/api/groups/${raceGroupId}/join`, method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, {
          member_name: `חבר מירוץ ${num}`,
          member_email: `racer_${num}@gemini.com`
        })
      )
    );

    const successfulConcurrent = concurrentJoins.filter(r => r.status === 200);
    const rejectedConcurrent = concurrentJoins.filter(r => r.status === 400);

    const raceFinalGroup = (await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${raceGroupId}`, method: 'GET'
    })).data.group;

    assertTest(successfulConcurrent.length === 2 && rejectedConcurrent.length === 4 && raceFinalGroup.members_count === 2,
      `Concurrency test: exactly 2 of 6 parallel requests succeeded, 4 rejected with 400, total capacity strictly respected`,
      `Success: ${successfulConcurrent.length}, Rejected: ${rejectedConcurrent.length}, DB Count: ${raceFinalGroup.members_count}`);


    // ===============================================================
    // SUITE 3: Duplicate Join Attempts (Case Insensitive Email)
    // ===============================================================
    console.log('\n--- SUITE 3: Duplicate Join Attempts (Case-Insensitive) ---');

    // Create fresh group for duplicate email tests
    const dupGroupRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'קבוצת בדיקת כפילויות',
      manager_name: 'מנהל בדיקת כפילות',
      manager_email: 'dup.Manager@Gmail.com',
      total_slots: 6,
      pin: '1111'
    });
    const dupGroupId = dupGroupRes.data.group.id;

    // 3.1 Initial join with MixedCase email
    const firstDupJoin = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'אבי כהן',
      member_email: 'Avi.Cohen.Test@Domain.Co.Il'
    });
    assertTest(firstDupJoin.status === 200, 'Initial join with mixed-case email succeeds');

    // 3.2 Duplicate join with identical lowercase email
    const lowerDupJoin = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'אבי שוב',
      member_email: 'avi.cohen.test@domain.co.il'
    });
    assertTest(lowerDupJoin.status === 400 && lowerDupJoin.data.error.includes('כבר נרשמה'),
      'Duplicate join with exact lowercase email is rejected with 400',
      `Got status ${lowerDupJoin.status}: ${JSON.stringify(lowerDupJoin.data)}`);

    // 3.3 Duplicate join with UPPERCASE and surrounding whitespace
    const upperDupJoin = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'אבי פעם שלישית',
      member_email: '   AVI.COHEN.TEST@DOMAIN.CO.IL   '
    });
    assertTest(upperDupJoin.status === 400 && upperDupJoin.data.error.includes('כבר נרשמה'),
      'Duplicate join with uppercase and padded whitespace is rejected with 400',
      `Got status ${upperDupJoin.status}: ${JSON.stringify(upperDupJoin.data)}`);

    // 3.4 Manager attempting to join their own group (case-insensitive)
    const managerAsMemberJoin = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: 'מנהל מתחזה',
      member_email: 'DUP.MANAGER@GMAIL.COM'
    });
    assertTest(managerAsMemberJoin.status === 400 && managerAsMemberJoin.data.error.includes('מנהל הקבוצה'),
      'Manager email (case-insensitive uppercase) rejected from joining as member with 400',
      `Got status ${managerAsMemberJoin.status}: ${JSON.stringify(managerAsMemberJoin.data)}`);


    // ===============================================================
    // SUITE 4: PIN Validation on Deletion & Re-Deletion
    // ===============================================================
    console.log('\n--- SUITE 4: PIN Validation on Deletion ---');

    // Create a group to test deletion flow
    const delGroupRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'קבוצה למחיקה עם PIN',
      manager_name: 'מנהל למחיקה',
      manager_email: 'to.delete@gemini.com',
      pin: '4567'
    });
    const delGroupId = delGroupRes.data.group.id;

    // 4.1 Delete with wrong PIN -> HTTP 401
    const wrongPinDel = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${delGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '0000' });
    assertTest(wrongPinDel.status === 401 && wrongPinDel.data.success === false,
      'Group deletion with incorrect PIN returns HTTP 401',
      `Got status ${wrongPinDel.status}: ${JSON.stringify(wrongPinDel.data)}`);

    // 4.2 Delete with missing PIN -> HTTP 400
    const missingPinDel = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${delGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {});
    assertTest(missingPinDel.status === 400 && missingPinDel.data.success === false,
      'Group deletion with missing PIN returns HTTP 400',
      `Got status ${missingPinDel.status}: ${JSON.stringify(missingPinDel.data)}`);

    // 4.3 Delete with correct PIN -> HTTP 200
    const correctPinDel = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${delGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '4567' });
    assertTest(correctPinDel.status === 200 && correctPinDel.data.success === true,
      'Group deletion with correct PIN returns HTTP 200',
      `Got status ${correctPinDel.status}: ${JSON.stringify(correctPinDel.data)}`);

    // 4.4 Delete already deleted group -> HTTP 404
    const repeatDel = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${delGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '4567' });
    assertTest(repeatDel.status === 404 && repeatDel.data.success === false,
      'Attempting to delete already deleted group returns HTTP 404',
      `Got status ${repeatDel.status}: ${JSON.stringify(repeatDel.data)}`);

    // 4.5 Querying deleted group via GET -> HTTP 404
    const getDeletedRes = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${delGroupId}`, method: 'GET'
    });
    assertTest(getDeletedRes.status === 404,
      'GET /api/groups/:id for deleted group returns HTTP 404',
      `Got status ${getDeletedRes.status}`);


    // ===============================================================
    // SUITE 5: Existing Post Operations Regression Tests
    // ===============================================================
    console.log('\n--- SUITE 5: Existing Post Operations Regression ---');

    // 5.1 Create Post (Offer)
    const postOfferRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/posts', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      type: 'offer',
      name: 'מציע ותיק',
      email: 'post.offer@legacy.com',
      cost_type: 'paid',
      notes: 'בדיקת נסיגה של מודעות קיימות',
      pin: '3333'
    });
    assertTest(postOfferRes.status === 201 && postOfferRes.data.success === true,
      'Legacy offer post creation returns 201',
      `Got status ${postOfferRes.status}`);
    const legacyOfferId = postOfferRes.data.post.id;

    // 5.2 Create Post (Request)
    const postReqRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/posts', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      type: 'request',
      name: 'מחפש ותיק',
      email: 'post.req@legacy.com',
      cost_type: 'free',
      notes: 'מחפש שיתוף חינם',
      pin: '4444'
    });
    assertTest(postReqRes.status === 201 && postReqRes.data.success === true,
      'Legacy request post creation returns 201',
      `Got status ${postReqRes.status}`);
    const legacyReqId = postReqRes.data.post.id;

    // 5.3 Filter posts by type and cost_type
    const getFilteredPosts = await request({
      hostname: 'localhost', port: PORT, path: '/api/posts?type=offer&cost_type=paid', method: 'GET'
    });
    assertTest(getFilteredPosts.status === 200 && Array.isArray(getFilteredPosts.data.posts) &&
      getFilteredPosts.data.posts.some(p => p.id === legacyOfferId),
      'GET /api/posts filtering by type and cost_type operates flawlessly',
      `Returned ${getFilteredPosts.data.posts?.length} posts`);

    // 5.4 Search posts by keyword
    const searchPostsRes = await request({
      hostname: 'localhost', port: PORT, path: `/api/posts?search=${encodeURIComponent('נסיגה')}`, method: 'GET'
    });
    assertTest(searchPostsRes.status === 200 &&
      searchPostsRes.data.posts.some(p => p.id === legacyOfferId),
      'GET /api/posts keyword search finds target post',
      `Matches: ${searchPostsRes.data.posts?.length}`);

    // 5.5 Close post with PIN
    const closePostRes = await request({
      hostname: 'localhost', port: PORT, path: `/api/posts/${legacyOfferId}/close`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '3333' });
    assertTest(closePostRes.status === 200 && closePostRes.data.success === true,
      'POST /api/posts/:id/close with correct PIN closes post',
      `Got status ${closePostRes.status}`);

    // 5.6 Verify closed post is filtered out from active list
    const activePostsAfterClose = await request({
      hostname: 'localhost', port: PORT, path: '/api/posts', method: 'GET'
    });
    assertTest(!activePostsAfterClose.data.posts.some(p => p.id === legacyOfferId),
      'Closed post is excluded from active posts list');

    // 5.7 Delete legacy request post with PIN
    const delPostWrongPin = await request({
      hostname: 'localhost', port: PORT, path: `/api/posts/${legacyReqId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '0000' });
    assertTest(delPostWrongPin.status === 401, 'Delete legacy post with wrong PIN returns 401');

    const delPostCorrectPin = await request({
      hostname: 'localhost', port: PORT, path: `/api/posts/${legacyReqId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '4444' });
    assertTest(delPostCorrectPin.status === 200, 'Delete legacy post with correct PIN returns 200');

    const delPostAgain = await request({
      hostname: 'localhost', port: PORT, path: `/api/posts/${legacyReqId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '4444' });
    assertTest(delPostAgain.status === 404, 'Deleting already deleted legacy post returns 404');


    // ===============================================================
    // SUITE 6: Additional Security, SQL Injection & Edge Cases
    // ===============================================================
    console.log('\n--- SUITE 6: Additional Security & SQL Injection Resilience ---');

    // 6.1 SQL injection attempt in search query parameter
    const sqliRes = await request({
      hostname: 'localhost', port: PORT, path: "/api/groups?search=' OR '1'='1' --", method: 'GET'
    });
    assertTest(sqliRes.status === 200 && sqliRes.data.success === true,
      'SQL Injection in GET /api/groups?search is safely neutralized by parameterized statements',
      `Status: ${sqliRes.status}`);

    const sqliPostRes = await request({
      hostname: 'localhost', port: PORT, path: "/api/posts?search=' UNION SELECT 1,2,3,4,5,6,7,8,9 --", method: 'GET'
    });
    assertTest(sqliPostRes.status === 200 && sqliPostRes.data.success === true,
      'SQL Injection in GET /api/posts?search is safely neutralized',
      `Status: ${sqliPostRes.status}`);

    // 6.2 Verify PIN endpoint for groups
    const verifyPinWrong = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/verify-pin`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '9999' });
    assertTest(verifyPinWrong.status === 401, 'POST /api/groups/:id/verify-pin returns 401 for bad PIN');

    const verifyPinCorrect = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/verify-pin`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '1111' });
    assertTest(verifyPinCorrect.status === 200, 'POST /api/groups/:id/verify-pin returns 200 for valid PIN');


    // ===============================================================
    // SUITE 7: Member Removal & Group Lifecycle State Machine
    // ===============================================================
    console.log('\n--- SUITE 7: Member Removal & Group Lifecycle State Machine ---');

    const lifeGroupRes = await request({
      hostname: 'localhost', port: PORT, path: '/api/groups', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'קבוצת מחזור חיים',
      manager_name: 'מנהל מחזור חיים',
      manager_email: 'life.manager@gemini.com',
      total_slots: 3,
      pin: '5678'
    });
    const lifeGroupId = lifeGroupRes.data.group.id;

    // Join 2 members to make group full
    const m1Res = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { member_name: 'חבר א', member_email: 'memberA@life.com' });
    const m2Res = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { member_name: 'חבר ב', member_email: 'memberB@life.com' });
    assertTest(m1Res.status === 200 && m2Res.status === 200 && m2Res.data.group.status === 'full',
      'Life cycle group filled to capacity (status="full", slots_free=0)');

    const memberAId = m2Res.data.group.members.find(m => m.member_email === 'membera@life.com').id;

    // 7.1 Remove member with wrong PIN
    const remWrongPin = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/remove-member`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '0000', member_id: memberAId });
    assertTest(remWrongPin.status === 401, 'remove-member with incorrect PIN returns 401');

    // 7.2 Remove non-existent member ID
    const remBadId = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/remove-member`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '5678', member_id: 999999 });
    assertTest(remBadId.status === 404, 'remove-member with non-existent member_id returns 404');

    // 7.3 Remove member with valid PIN -> status transitions back to 'open'
    const remOk = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/remove-member`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '5678', member_id: memberAId });
    assertTest(remOk.status === 200, 'remove-member with valid PIN returns 200');

    const lifeGroupAfterRem = (await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}`, method: 'GET'
    })).data.group;
    assertTest(lifeGroupAfterRem.status === 'open' && lifeGroupAfterRem.slots_free === 1,
      'Group automatically transitions back to "open" and frees slot after member removal');

    // 7.4 Close group with bad PIN -> 401
    const closeBadPin = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/close`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '0000' });
    assertTest(closeBadPin.status === 401, 'close group with bad PIN returns 401');

    // 7.5 Close group with valid PIN -> 200
    const closeOk = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/close`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '5678' });
    assertTest(closeOk.status === 200, 'close group with valid PIN returns 200');

    // 7.6 Attempt to join closed group -> 400
    const joinClosedRes = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/join`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { member_name: 'מצטרף מאוחר', member_email: 'late@life.com' });
    assertTest(joinClosedRes.status === 400 && joinClosedRes.data.error.includes('סגורה'),
      'Joining closed group is strictly rejected with 400');

    // 7.7 Reopen group with bad PIN -> 401
    const reopenBad = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/reopen`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '0000' });
    assertTest(reopenBad.status === 401, 'reopen group with bad PIN returns 401');

    // 7.8 Reopen group with valid PIN -> 200
    const reopenOk = await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/reopen`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '5678' });
    assertTest(reopenOk.status === 200 && reopenOk.data.status === 'open',
      'reopen group with valid PIN returns 200 and restores "open" status');

    // Delete life group
    await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${lifeGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '5678' });

    // 6.3 Cleanup test groups
    await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${dupGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '1111' });

    await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${capGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '7777' });

    await request({
      hostname: 'localhost', port: PORT, path: `/api/groups/${raceGroupId}/delete`, method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '8888' });

    console.log('\n====================================================');
    console.log(`📊 TEST SUITE SUMMARY:`);
    console.log(`   Total Tests:  ${testResults.total}`);
    console.log(`   Passed:       ${testResults.passed}`);
    console.log(`   Failed:       ${testResults.failed}`);
    console.log('====================================================');

    if (testResults.failed > 0) {
      console.error('\nFAILURES DETECTED:');
      testResults.failures.forEach(f => console.error(f));
      process.exitCode = 1;
    } else {
      console.log('\n🌟 ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS RATE!');
      process.exitCode = 0;
    }

  } catch (err) {
    console.error('Fatal test error:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runAdversarialSuite();
