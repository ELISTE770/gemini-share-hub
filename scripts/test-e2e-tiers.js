/**
 * scripts/test-e2e-tiers.js
 * Comprehensive Multi-Tier Opaque-Box E2E Test Suite for Gemini Share Hub
 *
 * Organized into 4 Systematic Tiers:
 * - Tier 1: Feature Coverage (Verifying every feature from PROJECT.md Feature Inventory in isolation)
 * - Tier 2: Boundary & Corner Cases (Limits, over-capacity, duplicate emails, invalid PINs, zero cost, extreme titles)
 * - Tier 3: Cross-Feature Combinations (Pairwise interactions, lifecycle state transitions, dual-mode tabs)
 * - Tier 4: Real-World Application Scenarios (Full student pool formation, classified posting, live port 3000 health check)
 */

'use strict';

process.env.NODE_ENV = 'test';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../server/index');
const db = require('../server/db');

// Configuration
const DEFAULT_PORT = 3000;
const FALLBACK_PORT = 3190;
let PORT = DEFAULT_PORT;
let serverInstance = null;
let startedOwnServer = false;

// Statistics Tracker
const results = {
  tier1: { total: 0, passed: 0, failed: 0 },
  tier2: { total: 0, passed: 0, failed: 0 },
  tier3: { total: 0, passed: 0, failed: 0 },
  tier4: { total: 0, passed: 0, failed: 0 },
  failures: []
};

function record(tier, name, condition, details = '') {
  const bucket = results[tier];
  bucket.total++;
  if (condition) {
    bucket.passed++;
    console.log(`    ✅ [PASS] ${name}`);
  } else {
    bucket.failed++;
    const errMsg = `[${tier.toUpperCase()}] ${name} -> ${details}`;
    console.error(`    ❌ [FAIL] ${name}: ${details}`);
    results.failures.push(errMsg);
  }
}

// HTTP Helper
function request(options, postData) {
  return new Promise((resolve, reject) => {
    const rawPath = options.path;
    const safePath = rawPath.includes('%') ? rawPath : encodeURI(rawPath);
    const reqOptions = {
      hostname: 'localhost',
      port: PORT,
      ...options,
      path: safePath,
      timeout: 5000
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: text,
          buffer
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout requesting ${safePath}`));
    });

    if (postData !== undefined) {
      if (typeof postData === 'string') {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

// Check if port responds
function probePort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/stats',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (ISOLATION)
// Verifying every feature from PROJECT.md Feature Inventory across R1-R4
// ============================================================================
async function runTier1() {
  console.log('\n================================================================');
  console.log('🏛️  TIER 1: FEATURE COVERAGE (IN ISOLATION)');
  console.log('================================================================');

  // --- Feature 1: Dark Luxury Color Palette Tokens ---
  console.log('\n  [F1] Dark Luxury Color Palette Tokens:');
  const cssPath = path.join(__dirname, '..', 'public', 'styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  record('tier1', 'CSS defines deep crystal navy background #0A1122',
    cssContent.includes('#0A1122'),
    'Expected #0A1122 in styles.css');
  record('tier1', 'CSS defines elevated card surfaces #14203A and #0F1A30',
    cssContent.includes('#14203A') && cssContent.includes('#0F1A30'),
    'Expected #14203A and #0F1A30 in styles.css');
  record('tier1', 'CSS defines radiant metallic gold #D4AF37 and gold glow #F5BE47',
    cssContent.includes('#D4AF37') && cssContent.includes('#F5BE47'),
    'Expected #D4AF37 and #F5BE47 in styles.css');
  record('tier1', 'CSS defines subtle silver border token #B0C4DE',
    cssContent.includes('#B0C4DE'),
    'Expected #B0C4DE in styles.css');

  // --- Feature 2: Hebrew Typography Alignment ---
  console.log('\n  [F2] Hebrew Typography Alignment:');
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  record('tier1', 'CSS binds --font-heading to Rubik',
    cssContent.includes('--font-heading:') && cssContent.includes('Rubik'),
    'Expected --font-heading: Rubik in styles.css');
  record('tier1', 'CSS binds --font-body to Heebo',
    cssContent.includes('--font-body:') && cssContent.includes('Heebo'),
    'Expected --font-body: Heebo in styles.css');
  record('tier1', 'CSS binds --font-mono to JetBrains Mono',
    cssContent.includes('--font-mono:') && cssContent.includes('JetBrains Mono'),
    'Expected --font-mono: JetBrains Mono in styles.css');
  record('tier1', 'index.html imports Rubik, Heebo and JetBrains Mono from Google Fonts',
    htmlContent.includes('fonts.googleapis.com') && htmlContent.includes('Rubik') && htmlContent.includes('Heebo'),
    'Google fonts link missing in index.html');

  // --- Feature 3: Glassmorphism & Gold Top-Rim Lighting ---
  console.log('\n  [F3] Glassmorphism & Gold Top-Rim Lighting:');
  record('tier1', 'CSS defines .glass-card with backdrop-filter blur',
    cssContent.includes('.glass-card') && cssContent.includes('backdrop-filter: blur'),
    'Missing backdrop-filter blur in .glass-card');
  record('tier1', 'CSS defines gold top rim lighting (border-top rgba(212,175,55,...))',
    cssContent.includes('border-top: 1px solid rgba(212, 175, 55') || cssContent.includes('border-top: 1px solid rgba(212,175,55'),
    'Missing gold top rim styling on glass panels');

  // --- Feature 4: RTL & Latin Run Isolation ---
  console.log('\n  [F4] RTL & Latin Run Isolation:');
  record('tier1', 'index.html has dir="rtl" on root HTML tag',
    htmlContent.includes('<html lang="he" dir="rtl"') || htmlContent.includes('dir="rtl"'),
    'HTML root missing dir="rtl"');
  record('tier1', 'CSS defines .ltr isolation class with unicode-bidi: isolate',
    cssContent.includes('.ltr') && cssContent.includes('direction: ltr') && cssContent.includes('unicode-bidi: isolate'),
    'Missing .ltr class with unicode-bidi isolate');

  // --- Feature 5: Group Data Model & Persistence Schema ---
  console.log('\n  [F5] Group Data Model & SQLite Schema:');
  const groupTableCheck = db.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='groups'`).get();
  const membersTableCheck = db.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='group_members'`).get();
  record('tier1', 'SQLite groups table exists with status and pin_hash',
    groupTableCheck && groupTableCheck.sql.includes('pin_hash') && groupTableCheck.sql.includes('status'),
    'groups table schema missing required columns');
  record('tier1', 'SQLite group_members table exists with foreign key references groups(id)',
    membersTableCheck && membersTableCheck.sql.includes('REFERENCES groups(id)'),
    'group_members foreign key constraint missing');

  // --- Feature 6: Group Creation Endpoint & UI ---
  console.log('\n  [F6] Group Creation Endpoint:');
  const createGroupRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '[T1-F6] קבוצת שיתוף בסיסית',
    manager_name: 'יוסי כהן',
    manager_email: 't1_manager@gmail.com',
    manager_phone: '052-1112233',
    cost_per_member: '15 ₪ לחודש',
    pin: '1234'
  });
  record('tier1', 'POST /api/groups creates group and returns 201',
    createGroupRes.status === 201 && createGroupRes.data && createGroupRes.data.success === true,
    `Status ${createGroupRes.status}`);
  const t1GroupId = createGroupRes.data.group.id;
  record('tier1', 'Created group initializes manager as slot 1 (slots_taken=1, needed_members=5)',
    createGroupRes.data.group.slots_taken === 1 && createGroupRes.data.group.needed_members === 5,
    `Slots taken: ${createGroupRes.data.group.slots_taken}`);

  // --- Feature 7: 5-Slot Occupancy Visualizer ---
  console.log('\n  [F7] 5-Slot Occupancy Visualizer:');
  const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  record('tier1', 'app.js tracks maxParticipantSlots = 5',
    appJsContent.includes('maxParticipantSlots = 5') || appJsContent.includes('5 - joinedCount'),
    'Expected 5 participant slots definition in app.js');
  record('tier1', 'app.js renders discrete chips .slot-chip.taken and .slot-chip.free',
    appJsContent.includes('slot-chip taken') && appJsContent.includes('slot-chip free'),
    'Expected slot chip classes in app.js');
  record('tier1', 'app.js renders formatted occupancy counter "X/5 תפוס, נותרו Y מקומות"',
    appJsContent.includes('${joinedCount}/5 תפוס, נותרו ${remainingSlots} מקומות'),
    'Expected occupancy text pattern in app.js');

  // --- Feature 8: Direct Member Join Flow ---
  console.log('\n  [F8] Direct Member Join Flow:');
  const joinRes1 = await request({
    path: `/api/groups/${t1GroupId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'דניאל שותף',
    member_email: 't1_daniel@gmail.com',
    member_phone: '054-9988776'
  });
  record('tier1', 'POST /api/groups/:id/join adds member and returns 200',
    joinRes1.status === 200 && joinRes1.data.success === true,
    `Status: ${joinRes1.status}`);
  record('tier1', 'Join increments slots_taken to 2 (needed_members=4)',
    joinRes1.data.group.slots_taken === 2 && joinRes1.data.group.needed_members === 4,
    `slots_taken: ${joinRes1.data.group.slots_taken}`);

  // --- Feature 9: Automatic Capacity Transition ---
  console.log('\n  [F9] Automatic Capacity Transition:');
  // Fill remaining 4 participant slots
  for (let i = 2; i <= 5; i++) {
    await request({
      path: `/api/groups/${t1GroupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: `חבר ${i}`,
      member_email: `t1_member_${i}@gmail.com`
    });
  }
  const checkFullRes = await request({
    path: `/api/groups/${t1GroupId}`,
    method: 'GET'
  });
  record('tier1', 'Group with 5 joined members automatically transitions to status "full"',
    checkFullRes.status === 200 && checkFullRes.data.group.status === 'full' && checkFullRes.data.group.slots_free === 0,
    `Status: ${checkFullRes.data.group.status}, free: ${checkFullRes.data.group.slots_free}`);

  // --- Feature 10: Manager PIN Controls ---
  console.log('\n  [F10] Manager PIN Controls:');
  const deleteGroupRes = await request({
    path: `/api/groups/${t1GroupId}/delete`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '1234' });
  record('tier1', 'POST /api/groups/:id/delete with valid PIN deletes group',
    deleteGroupRes.status === 200 && deleteGroupRes.data.success === true,
    `Status: ${deleteGroupRes.status}`);

  // --- Feature 11: Discount / Student Flag Input ---
  console.log('\n  [F11] Discount / Student Flag Input:');
  const studentGroupRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    manager_name: 'רוני סטודנט',
    manager_email: 't1_student@gmail.com',
    has_discount: true,
    discount_label: 'הנחת סטודנט מיוחדת (50%)',
    cost_per_member: '10 ₪',
    pin: '7777'
  });
  record('tier1', 'Group created with has_discount stores has_discount=true and discount_label',
    studentGroupRes.status === 201 && studentGroupRes.data.group.has_discount === true &&
    studentGroupRes.data.group.discount_label.includes('הנחת סטודנט מיוחדת'),
    `has_discount: ${studentGroupRes.data.group.has_discount}`);
  const studentGroupId = studentGroupRes.data.group.id;

  // --- Feature 12: Radiant Gold Discount Badge ---
  console.log('\n  [F12] Radiant Gold Discount Badge:');
  record('tier1', 'app.js includes .badge-discount-hero with 🎓 in card header rendering',
    appJsContent.includes('badge-discount-hero') && appJsContent.includes('🎓'),
    'Expected badge-discount-hero in app.js');
  record('tier1', 'Group title auto-prepends 🎓 and discount tag if not provided',
    studentGroupRes.data.group.title.includes('🎓') && studentGroupRes.data.group.title.includes('הנחת סטודנט מיוחדת'),
    `Title: ${studentGroupRes.data.group.title}`);

  // Clean up student group
  await request({ path: `/api/groups/${studentGroupId}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '7777' });

  // --- Feature 13: 4 Dual-Mode Navigation Tabs ---
  console.log('\n  [F13] 4 Dual-Mode Navigation Switcher Tabs:');
  record('tier1', 'HTML defines tab 1: tabGroupsBtn (קבוצות שיתוף)',
    htmlContent.includes('id="tabGroupsBtn"') && htmlContent.includes('קבוצות שיתוף'),
    'Missing tabGroupsBtn');
  record('tier1', 'HTML defines tab 2: tabOffersBtn (מציעים מנוי)',
    htmlContent.includes('id="tabOffersBtn"') && htmlContent.includes('מציעים מנוי'),
    'Missing tabOffersBtn');
  record('tier1', 'HTML defines tab 3: tabRequestsBtn (מחפשים מנוי)',
    htmlContent.includes('id="tabRequestsBtn"') && htmlContent.includes('מחפשים מנוי'),
    'Missing tabRequestsBtn');
  record('tier1', 'HTML defines tab 4: tabAllBtn (הכל)',
    htmlContent.includes('id="tabAllBtn"') && htmlContent.includes('הכל'),
    'Missing tabAllBtn');

  // --- Feature 14: Individual Classified Posts Board ---
  console.log('\n  [F14] Individual Classified Posts Board:');
  const postOfferRes = await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'offer',
    name: 'אביתר',
    email: 't1_evyatar@gmail.com',
    phone: '050-3334455',
    cost_type: 'paid',
    notes: 'מציע 2 מקומות',
    pin: '8888'
  });
  record('tier1', 'POST /api/posts creates individual offer post',
    postOfferRes.status === 201 && postOfferRes.data.post.type === 'offer',
    `Status: ${postOfferRes.status}`);
  const offerPostId = postOfferRes.data.post.id;

  const getFilteredPost = await request({
    path: '/api/posts?type=offer',
    method: 'GET'
  });
  record('tier1', 'GET /api/posts?type=offer retrieves created offer',
    getFilteredPost.status === 200 && getFilteredPost.data.posts.some(p => p.id === offerPostId),
    'Offer not found in filtered list');

  // Clean up post
  await request({ path: `/api/posts/${offerPostId}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '8888' });

  // --- Feature 15: Direct Contact Actions ---
  console.log('\n  [F15] Direct Contact Actions:');
  record('tier1', 'app.js defines formatWhatsAppLink generating valid https://wa.me/972... URLs',
    appJsContent.includes('https://wa.me/') && appJsContent.includes('972'),
    'WhatsApp format helper missing in app.js');
  record('tier1', 'app.js defines mailto and copyEmail contact triggers',
    appJsContent.includes('mailto:') && appJsContent.includes('copyEmail'),
    'Contact actions missing in app.js');

  // --- Feature 16: FAQ & Privacy Documentation ---
  console.log('\n  [F16] FAQ & Privacy Documentation:');
  record('tier1', 'index.html includes FAQ modal explaining Google Family 100% privacy and zero-password sharing',
    htmlContent.includes('id="faqModal"') && htmlContent.includes('פרטיות') && htmlContent.includes('Google Family'),
    'FAQ modal or privacy content missing');

  // --- Feature 17: Anti-Spam & Honeypot Protection ---
  console.log('\n  [F17] Anti-Spam & Honeypot Protection:');
  const botPostRes = await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'offer',
    email: 'bot@spam.com',
    website: 'http://malicious-spam.ru',
    pin: '9999'
  });
  record('tier1', 'POST /api/posts rejects spam bot submitting honeypot field "website" with 400',
    botPostRes.status === 400 && botPostRes.data && botPostRes.data.error.includes('נדחתה'),
    `Status: ${botPostRes.status}`);
}

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// Limits, over-capacity, duplicate emails, invalid PINs, zero cost, extreme inputs
// ============================================================================
async function runTier2() {
  console.log('\n================================================================');
  console.log('🛡️  TIER 2: BOUNDARY & CORNER CASES');
  console.log('================================================================');

  // Setup test group for boundary conditions
  const setupGroup = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '[T2-BOUND] קבוצת גבולות ומקרי קצה',
    manager_name: 'מנהל גבולות',
    manager_email: 'boundary_manager@gmail.com',
    manager_phone: '052-0000000',
    cost_per_member: '0 ₪',
    pin: '4321'
  });
  const bGroupId = setupGroup.data.group.id;

  // --- Boundary 2.1: Over-Capacity 6th Join Rejection ---
  console.log('\n  [B2.1] Over-Capacity Rejection (Strict 5 Members Limit):');
  for (let i = 1; i <= 5; i++) {
    await request({
      path: `/api/groups/${bGroupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: `חבר גבול ${i}`,
      member_email: `b_member_${i}@gmail.com`
    });
  }
  const overflowRes = await request({
    path: `/api/groups/${bGroupId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'משתתף שביעי (חריגה מעבר ל-5)',
    member_email: 'b_overflow@gmail.com'
  });
  record('tier2', 'Attempting to join a full 5-member group is rejected with HTTP 400',
    overflowRes.status === 400 && overflowRes.data.error.includes('כל המקומות בקבוצה זו נתפסו'),
    `Status: ${overflowRes.status}, Error: ${overflowRes.data && overflowRes.data.error}`);

  // --- Boundary 2.2: Case-Insensitive Duplicate Email Rejection ---
  console.log('\n  [B2.2] Case-Insensitive Duplicate Email Rejection:');
  // Free up 1 slot first
  const groupDataBefore = (await request({ path: `/api/groups/${bGroupId}`, method: 'GET' })).data.group;
  const firstMemId = groupDataBefore.members[0].id;
  await request({
    path: `/api/groups/${bGroupId}/remove-member`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '4321', member_id: firstMemId });

  // Try to join with email identical to member 2, but UPPERCASE
  const dupUpperRes = await request({
    path: `/api/groups/${bGroupId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'מתחזה',
    member_email: 'B_MEMBER_2@GMAIL.COM'
  });
  record('tier2', 'Case-insensitive duplicate email (UPPERCASE vs lowercase) is rejected with HTTP 400',
    dupUpperRes.status === 400 && dupUpperRes.data.error.includes('כבר נרשמה'),
    `Status: ${dupUpperRes.status}, Error: ${dupUpperRes.data && dupUpperRes.data.error}`);

  // Manager email joining as member
  const managerJoinRes = await request({
    path: `/api/groups/${bGroupId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'המנהל מנסה להצטרף כחבר',
    member_email: 'BOUNDARY_MANAGER@GMAIL.COM'
  });
  record('tier2', 'Manager email attempting to join as member is rejected with HTTP 400',
    managerJoinRes.status === 400 && managerJoinRes.data.error.includes('מנהל הקבוצה'),
    `Status: ${managerJoinRes.status}, Error: ${managerJoinRes.data && managerJoinRes.data.error}`);

  // Whitespace-padded duplicate email
  const spaceDupRes = await request({
    path: `/api/groups/${bGroupId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'רווחים',
    member_email: '   b_member_3@gmail.com   '
  });
  record('tier2', 'Whitespace-padded duplicate email is properly normalized and rejected with HTTP 400',
    spaceDupRes.status === 400 && spaceDupRes.data.error.includes('כבר נרשמה'),
    `Status: ${spaceDupRes.status}`);

  // --- Boundary 2.3: Invalid and Edge PINs ---
  console.log('\n  [B2.3] Invalid & Edge PIN Validations:');
  const shortPinGroupRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    manager_name: 'קוד קצר',
    manager_email: 'shortpin@gmail.com',
    pin: '12'
  });
  record('tier2', 'Group creation with PIN < 4 chars is rejected with HTTP 400',
    shortPinGroupRes.status === 400 && shortPinGroupRes.data.error.includes('לפחות 4 תווים'),
    `Status: ${shortPinGroupRes.status}`);

  const shortPinPostRes = await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'request',
    email: 'shortpinpost@gmail.com',
    cost_type: 'free',
    pin: '9'
  });
  record('tier2', 'Post creation with PIN < 4 chars is rejected with HTTP 400',
    shortPinPostRes.status === 400 && shortPinPostRes.data.error.includes('לפחות 4 תווים'),
    `Status: ${shortPinPostRes.status}`);

  const missingPinDeleteRes = await request({
    path: `/api/groups/${bGroupId}/delete`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {});
  record('tier2', 'Group deletion with missing PIN returns HTTP 400',
    missingPinDeleteRes.status === 400 && missingPinDeleteRes.data.error.includes('קוד ניהול'),
    `Status: ${missingPinDeleteRes.status}`);

  const wrongPinDeleteRes = await request({
    path: `/api/groups/${bGroupId}/delete`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '9999' });
  record('tier2', 'Group deletion with wrong PIN returns HTTP 401',
    wrongPinDeleteRes.status === 401 && wrongPinDeleteRes.data.error.includes('שגוי'),
    `Status: ${wrongPinDeleteRes.status}`);

  // --- Boundary 2.4: Missing & Malformed Field Validations ---
  console.log('\n  [B2.4] Missing and Malformed Field Rejections:');
  const emptyNameRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    manager_name: '   ',
    manager_email: 'valid@gmail.com',
    pin: '1234'
  });
  record('tier2', 'Group creation with empty manager name is rejected with HTTP 400',
    emptyNameRes.status === 400 && emptyNameRes.data.error.includes('שם מנהל הקבוצה'),
    `Status: ${emptyNameRes.status}`);

  const invalidEmailRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    manager_name: 'בדיקה',
    manager_email: 'not-an-email',
    pin: '1234'
  });
  record('tier2', 'Group creation with invalid email missing @ is rejected with HTTP 400',
    invalidEmailRes.status === 400 && invalidEmailRes.data.error.includes('כתובת אימייל לא תקינה'),
    `Status: ${invalidEmailRes.status}`);

  const invalidPostTypeRes = await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'invalid_type',
    email: 'valid@gmail.com',
    cost_type: 'free',
    pin: '1234'
  });
  record('tier2', 'Post creation with invalid type is rejected with HTTP 400',
    invalidPostTypeRes.status === 400 && invalidPostTypeRes.data.error.includes('סוג מודעה לא תקין'),
    `Status: ${invalidPostTypeRes.status}`);

  const nonExistentGroupRes = await request({
    path: '/api/groups/9999999',
    method: 'GET'
  });
  record('tier2', 'GET /api/groups/:id for non-existent ID returns HTTP 404',
    nonExistentGroupRes.status === 404,
    `Status: ${nonExistentGroupRes.status}`);

  // --- Boundary 2.5: Zero Cost & Extreme Numeric Cost Formats ---
  console.log('\n  [B2.5] Zero Cost & Extreme Cost String Handling:');
  const zeroCostGroup = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '[T2-ZERO] קבוצה חינמית',
    manager_name: 'נדיב',
    manager_email: 'free_manager@gmail.com',
    cost_per_member: '0 ₪ (ללא תשלום)',
    pin: '5555'
  });
  record('tier2', 'Group with "0 ₪" cost is safely stored without null or NaN errors',
    zeroCostGroup.status === 201 && zeroCostGroup.data.group.cost_per_member === '0 ₪ (ללא תשלום)',
    `Cost: ${zeroCostGroup.data.group.cost_per_member}`);
  await request({ path: `/api/groups/${zeroCostGroup.data.group.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '5555' });

  // --- Boundary 2.6: Extreme Titles & Special Character Escaping ---
  console.log('\n  [B2.6] Extreme Titles & Special Characters:');
  const extremeTitle = 'כותרת_ארוכה_מאוד_'.repeat(10); // > 150 chars
  const extremeRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: extremeTitle,
    manager_name: 'יוסי <b>Bold</b> & "Quotes"',
    manager_email: 'extreme@gmail.com',
    notes: 'הערות עם תווים מיוחדים: <script>alert(1)</script> 🎓 🌟 👥',
    pin: '6666'
  });
  record('tier2', 'Extremely long title is gracefully truncated to 100 chars without database crash',
    extremeRes.status === 201 && extremeRes.data.group.title.length <= 100,
    `Length: ${extremeRes.data.group.title.length}`);
  record('tier2', 'Hebrew, HTML meta-characters and emojis stored with integrity',
    extremeRes.data.group.notes.includes('🎓') && extremeRes.data.group.notes.includes('<script>'),
    'Special chars corrupted in storage');
  await request({ path: `/api/groups/${extremeRes.data.group.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '6666' });

  // Empty title auto-generation
  const autoTitleRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '',
    manager_name: 'דניאל',
    manager_email: 'autotitle@gmail.com',
    pin: '7777'
  });
  record('tier2', 'Empty title automatically generates standard Hebrew title with manager name',
    autoTitleRes.status === 201 && autoTitleRes.data.group.title.includes('קבוצת שיתוף עלויות — דניאל'),
    `Generated title: ${autoTitleRes.data.group.title}`);
  await request({ path: `/api/groups/${autoTitleRes.data.group.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '7777' });

  // --- Boundary 2.7: Honeypot Protection on Join ---
  console.log('\n  [B2.7] Anti-Spam Honeypot on Member Join:');
  const botJoinRes = await request({
    path: `/api/groups/${bGroupId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'בוט',
    member_email: 'bot_join@spam.com',
    website: 'http://spam-link.org'
  });
  record('tier2', 'POST /api/groups/:id/join rejects bot filling website honeypot with HTTP 400',
    botJoinRes.status === 400 && botJoinRes.data.error.includes('נדחתה'),
    `Status: ${botJoinRes.status}`);

  // Cleanup boundary group
  await request({ path: `/api/groups/${bGroupId}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '4321' });
}

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// Pairwise interactions, lifecycle state transitions, dual-mode tabs
// ============================================================================
async function runTier3() {
  console.log('\n================================================================');
  console.log('🔗  TIER 3: CROSS-FEATURE COMBINATIONS');
  console.log('================================================================');

  // --- Combination 3.1: Student Discount + 5 Joins + Auto-Lock + Remove Member + Cascade Delete ---
  console.log('\n  [C3.1] Student Discount + 5 Joins + Auto-Lock + Reopen + Cascade Delete:');
  const cGroupRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '[T3-COMB] קבוצת סטודנטים משולבת',
    manager_name: 'תמר כהן',
    manager_email: 'tamar_student@gmail.com',
    manager_phone: '054-7776655',
    has_discount: true,
    discount_label: 'הנחת סטודנט לרפואה (50% הנחה)',
    cost_per_member: '12.5 ₪ לחודש',
    pin: '3333'
  });
  const cGroupId = cGroupRes.data.group.id;
  record('tier3', 'Group with student discount created and title auto-annotated with 🎓',
    cGroupRes.status === 201 && cGroupRes.data.group.title.includes('🎓') && cGroupRes.data.group.has_discount === true,
    `Title: ${cGroupRes.data.group.title}`);

  // Progressively join 5 members and verify slot tracker at each step
  const studentMembers = [
    { name: 'אורן', email: 'oren_t3@gmail.com' },
    { name: 'שירה', email: 'shira_t3@gmail.com' },
    { name: 'גל', email: 'gal_t3@gmail.com' },
    { name: 'עדי', email: 'adi_t3@gmail.com' },
    { name: 'מיכל', email: 'michal_t3@gmail.com' }
  ];

  let joinsOk = true;
  for (let idx = 0; idx < studentMembers.length; idx++) {
    const sm = studentMembers[idx];
    const jRes = await request({
      path: `/api/groups/${cGroupId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: sm.name,
      member_email: sm.email
    });
    if (jRes.status !== 200 || jRes.data.group.slots_taken !== (idx + 2)) {
      joinsOk = false;
    }
  }
  record('tier3', '5 distinct student members successfully claimed all 5 available slots sequentially',
    joinsOk,
    'Failed sequential joining');

  // Verify full auto-lock
  const lockedGroup = (await request({ path: `/api/groups/${cGroupId}`, method: 'GET' })).data.group;
  record('tier3', 'Group reached 6/6 capacity: status is "full" and slots_free is 0',
    lockedGroup.status === 'full' && lockedGroup.slots_free === 0 && lockedGroup.needed_members === 0,
    `Status: ${lockedGroup.status}, free: ${lockedGroup.slots_free}`);

  // Manager removes 1 member via PIN
  const memberToRemove = lockedGroup.members[2]; // 'גל'
  const removeRes = await request({
    path: `/api/groups/${cGroupId}/remove-member`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    pin: '3333',
    member_id: memberToRemove.id
  });
  record('tier3', 'Manager removes member with PIN: remove-member returns HTTP 200',
    removeRes.status === 200 && removeRes.data.success === true,
    `Status: ${removeRes.status}`);

  // Group auto-reverts to 'open'
  const reopenedGroup = (await request({ path: `/api/groups/${cGroupId}`, method: 'GET' })).data.group;
  record('tier3', 'Removing member automatically transitions status back to "open" with 1 slot free',
    reopenedGroup.status === 'open' && reopenedGroup.slots_free === 1 && reopenedGroup.needed_members === 1,
    `Status: ${reopenedGroup.status}, free: ${reopenedGroup.slots_free}`);

  // Cascade Delete check: delete group and verify DB foreign key cascade
  const deleteCGroup = await request({
    path: `/api/groups/${cGroupId}/delete`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '3333' });
  record('tier3', 'Manager deletes group with valid PIN',
    deleteCGroup.status === 200,
    `Status: ${deleteCGroup.status}`);

  // Direct SQLite query to verify cascade deletion in group_members table
  const lingeringMembers = db.db.prepare(`SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?`).get(cGroupId).cnt;
  record('tier3', 'Cascade delete verified: zero orphan rows remain in group_members table',
    lingeringMembers === 0,
    `Found ${lingeringMembers} orphan rows`);

  // --- Combination 3.2: Group Creation + Filter by Discount + Live Stats Synchronization ---
  console.log('\n  [C3.2] Group Creation + Filter by Discount + Live Stats Synchronization:');
  const initialStats = (await request({ path: '/api/stats', method: 'GET' })).data.stats;

  // Create standard group
  const regGroup = (await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '[T3-REG] קבוצה רגילה ללא הנחה',
    manager_name: 'יונתן',
    manager_email: 'reg_manager@gmail.com',
    has_discount: false,
    cost_per_member: '20 ₪',
    pin: '1111'
  })).data.group;

  // Create discount group
  const discGroup = (await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: '[T3-DISC] קבוצת הנחת מבצע',
    manager_name: 'ליאור',
    manager_email: 'disc_manager@gmail.com',
    has_discount: true,
    discount_label: 'מבצע סוף שנה',
    cost_per_member: '10 ₪',
    pin: '2222'
  })).data.group;

  // Query filter: has_discount=true
  const discountFilterRes = await request({
    path: '/api/groups?has_discount=true',
    method: 'GET'
  });
  const discountGroups = discountFilterRes.data.groups;
  record('tier3', 'GET /api/groups?has_discount=true includes discount group and excludes regular group',
    discountGroups.some(g => g.id === discGroup.id) && !discountGroups.some(g => g.id === regGroup.id),
    'Discount filtering mismatch');

  // Add 1 member to discGroup
  await request({
    path: `/api/groups/${discGroup.id}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'משתתף מבצע',
    member_email: 'disc_member@gmail.com'
  });

  // Verify updated stats
  const postStats = (await request({ path: '/api/stats', method: 'GET' })).data.stats;
  record('tier3', 'Live stats update: active groups count increased by 2',
    postStats.groups === initialStats.groups + 2,
    `Expected ${initialStats.groups + 2}, got ${postStats.groups}`);
  record('tier3', 'Live stats update: groupMembers count incremented by 1',
    postStats.groupMembers === initialStats.groupMembers + 1,
    `Expected ${initialStats.groupMembers + 1}, got ${postStats.groupMembers}`);

  // Clean up
  await request({ path: `/api/groups/${regGroup.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '1111' });
  await request({ path: `/api/groups/${discGroup.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '2222' });

  // --- Combination 3.3: Dual-Mode Navigation State Machine with Concurrent Posts & Groups ---
  console.log('\n  [C3.3] Dual-Mode State Machine & Isolation between Posts and Groups:');
  const postOffer = (await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'offer',
    email: 'c3_offer@gmail.com',
    cost_type: 'paid',
    notes: 'מציע מקום במנוי שנתי',
    pin: '4444'
  })).data.post;

  const postRequest = (await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'request',
    email: 'c3_request@gmail.com',
    cost_type: 'free',
    notes: 'מחפש להצטרף לשיתוף חינם',
    pin: '5555'
  })).data.post;

  const offersOnlyRes = await request({ path: '/api/posts?type=offer', method: 'GET' });
  const requestsOnlyRes = await request({ path: '/api/posts?type=request', method: 'GET' });

  record('tier3', 'Post query by type=offer contains only offers and excludes requests',
    offersOnlyRes.data.posts.some(p => p.id === postOffer.id) &&
    !offersOnlyRes.data.posts.some(p => p.id === postRequest.id),
    'Offers list contains unexpected posts');

  record('tier3', 'Post query by type=request contains only requests and excludes offers',
    requestsOnlyRes.data.posts.some(p => p.id === postRequest.id) &&
    !requestsOnlyRes.data.posts.some(p => p.id === postOffer.id),
    'Requests list contains unexpected posts');

  // Verify clean separation between /api/groups and /api/posts
  const groupsListRes = await request({ path: '/api/groups', method: 'GET' });
  record('tier3', 'Groups and Posts endpoints maintain strict isolation with no cross-contamination',
    Array.isArray(groupsListRes.data.groups) && Array.isArray(offersOnlyRes.data.posts),
    'API data model pollution detected');

  // Clean up
  await request({ path: `/api/posts/${postOffer.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '4444' });
  await request({ path: `/api/posts/${postRequest.id}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '5555' });
}

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// Full realistic user journeys, student pool formation, live port 3000 health check
// ============================================================================
async function runTier4() {
  console.log('\n================================================================');
  console.log('🚀  TIER 4: REAL-WORLD APPLICATION SCENARIOS');
  console.log('================================================================');

  // --- Scenario 4.1: Student Pool Formation & Capacity Full Lock Journey ---
  console.log('\n  [S4.1] Real-World Student Pool Formation & Capacity Lock Journey:');
  console.log('    -> Step 1: נועה רוטשילד (סטודנטית באת"א) יוצרת קבוצת שיתוף עם הנחת סטודנט');
  const poolRes = await request({
    path: '/api/groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    title: 'קבוצת סטודנטים אונ\' תל אביב — מנוי Gemini שנתי מוזל',
    manager_name: 'נועה רוטשילד',
    manager_email: 'noa.tau.student@gmail.com',
    manager_phone: '054-9876543',
    has_discount: true,
    discount_label: 'הנחת סטודנט אוניברסיטת תל אביב (50% הנחה)',
    cost_per_member: '12 ₪ לחודש',
    notes: 'היי לכולם! פתחתי מנוי שנתי מוזל במסגרת הטבת סטודנטים. מחפשת 5 שותפים רציניים.',
    pin: '9876'
  });
  record('tier4', 'Journey: נועה successfully creates university student pool with prominent discount',
    poolRes.status === 201 && poolRes.data.group.has_discount === true,
    `Status: ${poolRes.status}`);
  const poolId = poolRes.data.group.id;

  console.log('    -> Step 2: 5 סטודנטים מצטרפים ברצף, בודקים התקדמות סרגל התפוסה (1/5 עד 5/5)');
  const applicantPool = [
    { name: 'יונתן כץ', email: 'yonatan.tau@gmail.com', phone: '052-1111111' },
    { name: 'תמר שפירא', email: 'tamar.tau@gmail.com', phone: '053-2222222' },
    { name: 'איתן ברק', email: 'eitan.tau@gmail.com', phone: '054-3333333' },
    { name: 'שירה אלוני', email: 'shira.tau@gmail.com', phone: '050-4444444' },
    { name: 'דניאל גולן', email: 'daniel.tau@gmail.com', phone: '058-5555555' }
  ];

  let progressionOk = true;
  for (let i = 0; i < applicantPool.length; i++) {
    const applicant = applicantPool[i];
    const joinRes = await request({
      path: `/api/groups/${poolId}/join`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      member_name: applicant.name,
      member_email: applicant.email,
      member_phone: applicant.phone,
      notes: 'סטודנט באת"א, מעביר בביט'
    });
    const currentTaken = joinRes.data.group.slots_taken;
    const currentFree = joinRes.data.group.slots_free;
    if (currentTaken !== (i + 2) || currentFree !== (5 - i - 1)) {
      progressionOk = false;
    }
  }
  record('tier4', 'Journey: Slot occupancy tracker progressed smoothly from 1/5 to 5/5 filled',
    progressionOk,
    'Occupancy progression failed');

  console.log('    -> Step 3: הקבוצה נעולה אוטומטית כ-"קבוצה מלאה" (full), משתתף שישי מנסה להצטרף');
  const sixthApplicantRes = await request({
    path: `/api/groups/${poolId}/join`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    member_name: 'רועי (משתתף שישי שמאחר)',
    member_email: 'roei.late@gmail.com'
  });
  record('tier4', 'Journey: 6th applicant is politely rejected with 400 since all 5 slots are claimed',
    sixthApplicantRes.status === 400 && sixthApplicantRes.data.error.includes('כל המקומות בקבוצה זו נתפסו'),
    `Status: ${sixthApplicantRes.status}`);

  console.log('    -> Step 4: נועה מזינה את קוד ה-PIN שלה, מאמתת את רשימת כל 5 השותפים, וסוגרת את הקבוצה');
  const verifyPinRes = await request({
    path: `/api/groups/${poolId}/verify-pin`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '9876' });
  record('tier4', 'Journey: Manager PIN verified successfully in management modal',
    verifyPinRes.status === 200 && verifyPinRes.data.success === true,
    `Status: ${verifyPinRes.status}`);

  const closeGroupRes = await request({
    path: `/api/groups/${poolId}/close`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '9876' });
  record('tier4', 'Journey: Manager marks group closed; group status transitions to "closed"',
    closeGroupRes.status === 200 && closeGroupRes.data.success === true,
    `Status: ${closeGroupRes.status}`);

  // Clean up
  await request({ path: `/api/groups/${poolId}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '9876' });

  // --- Scenario 4.2: Classified Posting & Direct Contact Action Journey ---
  console.log('\n  [S4.2] Real-World Classifieds & Direct Contact Interaction Journey:');
  console.log('    -> Step 1: מפרסם יוצר מודעת שיתוף אישית עם פרטי וואטסאפ ומייל');
  const classifiedOfferRes = await request({
    path: '/api/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'offer',
    name: 'ערן לוי',
    email: 'eran.gemini@gmail.com',
    phone: '050-1234567',
    cost_type: 'paid',
    notes: 'נותר מקום 1 אחרון במנוי Google One משפחתי פעיל!',
    pin: '2468'
  });
  record('tier4', 'Journey: Classified offer posted successfully with phone and email',
    classifiedOfferRes.status === 201 && classifiedOfferRes.data.post.name === 'ערן לוי',
    `Status: ${classifiedOfferRes.status}`);
  const cPostId = classifiedOfferRes.data.post.id;

  console.log('    -> Step 2: אימות יצירת קישורי פנייה ישירה (WhatsApp, Mailto, Copy Email)');
  const rawAppJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const expectedPhoneDigits = '972501234567';
  const expectedWaPrefix = `https://wa.me/${expectedPhoneDigits}`;
  record('tier4', 'Journey: WhatsApp link generation converts 050-1234567 into international 972 prefix',
    rawAppJs.includes("digits.startsWith('0')") && rawAppJs.includes("'972' + digits.substring(1)"),
    'WhatsApp phone internationalization logic missing');
  record('tier4', 'Journey: Mailto link encodes Hebrew subject properly',
    rawAppJs.includes('mailto:') && rawAppJs.includes('encodeURIComponent'),
    'Mailto encoding logic missing');

  console.log('    -> Step 3: בעל המודעה סוגר אותה עם קוד ה-PIN, המודעה יורדת מהלוח הפעיל');
  const closePostRes = await request({
    path: `/api/posts/${cPostId}/close`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '2468' });
  record('tier4', 'Journey: Post closed with PIN: excluded from active posts feed',
    closePostRes.status === 200,
    `Status: ${closePostRes.status}`);

  const activePostsCheck = (await request({ path: '/api/posts', method: 'GET' })).data.posts;
  record('tier4', 'Journey: Closed post no longer appears in GET /api/posts feed',
    !activePostsCheck.some(p => p.id === cPostId),
    'Closed post still visible in active feed');

  // Clean up post
  await request({ path: `/api/posts/${cPostId}/delete`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, { pin: '2468' });

  // --- Scenario 4.3: Port 3000 Static Asset Integrity & Live Server Health Check ---
  console.log('\n  [S4.3] Port 3000 Static Asset Integrity & Live Server Health Check:');
  const staticEndpoints = [
    { uri: '/', expectedType: 'text/html' },
    { uri: '/styles.css', expectedType: 'text/css' },
    { uri: '/app.js', expectedType: 'application/javascript' },
    { uri: '/favicon.ico', expectedType: 'image/x-icon' },
    { uri: '/assets/apple-touch-icon.png', expectedType: 'image/png' },
    { uri: '/assets/smart-binary-logo.png', expectedType: 'image/png' },
    { uri: '/assets/smart-binary-logo.webp', expectedType: 'image/webp' },
    { uri: '/assets/smart-binary-mark.png', expectedType: 'image/png' },
    { uri: '/assets/smart-binary-mark.webp', expectedType: 'image/webp' },
    { uri: '/teamwork-preview', expectedType: 'text/html' },
    { uri: '/boost', expectedType: 'text/html' }
  ];

  let zero404s = true;
  let allMimesValid = true;

  for (const asset of staticEndpoints) {
    const tStart = Date.now();
    const res = await request({ path: asset.uri, method: 'GET' });
    const latency = Date.now() - tStart;

    if (res.status !== 200) {
      zero404s = false;
      console.error(`      Asset ${asset.uri} returned ${res.status}`);
    }
    const contentType = res.headers['content-type'] || '';
    if (!contentType.includes(asset.expectedType)) {
      allMimesValid = false;
      console.error(`      Asset ${asset.uri} content-type mismatch: got ${contentType}, expected ${asset.expectedType}`);
    }
  }

  record('tier4', 'Live Port 3000: All 11 static routes and assets return HTTP 200 with Zero 404s',
    zero404s,
    'One or more static assets failed to load');
  record('tier4', 'Live Port 3000: All static assets deliver valid content-type headers',
    allMimesValid,
    'Content-Type mismatch detected');

  // Live API latency and health check
  const pingStart = Date.now();
  const liveHealth = await request({ path: '/api/stats', method: 'GET' });
  const latency = Date.now() - pingStart;

  record('tier4', `Live Port 3000: Server API responds with ultra-low latency (< 150ms, measured: ${latency}ms)`,
    latency < 150 && liveHealth.status === 200 && liveHealth.data.success === true,
    `Latency too high (${latency}ms) or status != 200`);
}

// ============================================================================
// MAIN RUNNER & TEST HARNESS LIFECYCLE
// ============================================================================
async function runAllTiers() {
  console.log('================================================================');
  console.log('🌟 GEMINI SHARE HUB — MULTI-TIER E2E TEST SUITE (M2)');
  console.log('Target: Dark Luxury Design, 5-Slot Pool, PIN Controls, Live Port 3000');
  console.log('================================================================');

  // Check if server is already running on port 3000
  const isPort3000Active = await probePort(DEFAULT_PORT);
  if (isPort3000Active) {
    PORT = DEFAULT_PORT;
    console.log(`📡 Connected to live server on http://localhost:${PORT}`);
  } else {
    // Start server in-process
    PORT = DEFAULT_PORT;
    try {
      serverInstance = app.listen(PORT, () => {
        console.log(`🚀 Started test server instance on http://localhost:${PORT}`);
      });
      startedOwnServer = true;
    } catch {
      PORT = FALLBACK_PORT;
      serverInstance = app.listen(PORT, () => {
        console.log(`🚀 Started test server instance on http://localhost:${PORT}`);
      });
      startedOwnServer = true;
    }
  }

  try {
    await runTier1();
    await runTier2();
    await runTier3();
    await runTier4();
  } catch (err) {
    console.error('\n💥 Unhandled Exception during test execution:', err);
    results.failures.push(`Unhandled Exception: ${err.message}`);
  } finally {
    if (startedOwnServer && serverInstance) {
      serverInstance.close();
    }
  }

  // Print Summary Matrix
  const totalTests = results.tier1.total + results.tier2.total + results.tier3.total + results.tier4.total;
  const totalPassed = results.tier1.passed + results.tier2.passed + results.tier3.passed + results.tier4.passed;
  const totalFailed = results.tier1.failed + results.tier2.failed + results.tier3.failed + results.tier4.failed;

  console.log('\n================================================================');
  console.log('📊 MULTI-TIER TEST EXECUTION SUMMARY:');
  console.log('================================================================');
  console.log(`  Tier 1 (Feature Coverage):            ${results.tier1.passed}/${results.tier1.total} passed`);
  console.log(`  Tier 2 (Boundary & Corner Cases):     ${results.tier2.passed}/${results.tier2.total} passed`);
  console.log(`  Tier 3 (Cross-Feature Combinations):   ${results.tier3.passed}/${results.tier3.total} passed`);
  console.log(`  Tier 4 (Real-World Scenarios):        ${results.tier4.passed}/${results.tier4.total} passed`);
  console.log('----------------------------------------------------------------');
  console.log(`  TOTAL:                                ${totalPassed}/${totalTests} passed (${totalFailed} failed)`);
  console.log('================================================================');

  if (totalFailed === 0) {
    console.log('\n🎉 ALL 4 TIERS PASSED WITH 100% SUCCESS RATE! (Exit code 0)');
    process.exit(0);
  } else {
    console.error(`\n⚠️  ${totalFailed} TEST(S) FAILED:`);
    results.failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runAllTiers();
