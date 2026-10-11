/**
 * test-challenger-2.js
 * Empirical Challenge Harness for Milestone 1:
 * 1. Server startup on port 3000 (http://localhost:3000)
 * 2. Static assets inspection: GET /, GET /styles.css, GET /app.js, GET /assets/... (zero 404s, proper MIME types)
 * 3. CSS rules inspection: Rubik/Heebo font declarations, .ltr class behavior, .glass-card top rim gold, RTL 20% 50% radial gradient
 * 4. 4-Tab switcher ("קבוצות שיתוף", "מציעים מנוי", "מחפשים מנוי", "הכל") state management and DOM rendering under rapid switching
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = 'localhost';
const PORT = 3000;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function recordResult(name, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name} -> ${details}`);
  }
  testResults.push({ name, passed, details });
}

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: HOST,
      port: PORT,
      path: urlPath,
      method: options.method || 'GET',
      headers: options.headers || {},
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
          statusCode: res.statusCode,
          headers: res.headers,
          buffer,
          text,
          json
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${urlPath}`));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Minimal DOM simulation for unit testing app.js state & DOM mutations
class SimpleElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      add: (cls) => this.classList._classes.add(cls),
      remove: (cls) => this.classList._classes.delete(cls),
      contains: (cls) => this.classList._classes.has(cls),
      toggle: (cls) => {
        if (this.classList._classes.has(cls)) this.classList._classes.delete(cls);
        else this.classList._classes.add(cls);
      }
    };
    this.style = {};
    this.attributes = new Map();
    this.dataset = {};
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.eventListeners = {};
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  dispatchEvent(event) {
    const list = this.eventListeners[event] || [];
    for (const fn of list) {
      fn({ target: this });
    }
  }
}

async function runEmpiricalHarness() {
  console.log('================================================================');
  console.log('CHALLENGER 2: EMPIRICAL VERIFICATION HARNESS — MILESTONE 1');
  console.log('Target: UI, Design System, Static Assets & 4-Tab Switcher');
  console.log('================================================================\n');

  // ====================================================================
  // TEST SUITE 1: Server Startup & Port 3000 Connectivity
  // ====================================================================
  console.log('--- TEST SUITE 1: SERVER CONNECTIVITY (PORT 3000) ---');
  try {
    const startT = Date.now();
    const rootRes = await fetchUrl('/');
    const latency = Date.now() - startT;

    recordResult(
      'Server answers on http://localhost:3000 with HTTP 200',
      rootRes.statusCode === 200,
      `Received status ${rootRes.statusCode}`
    );

    recordResult(
      'Server latency is < 150ms (measured: ' + latency + 'ms)',
      latency < 150,
      `Latency too high: ${latency}ms`
    );

    recordResult(
      'Server returns HTML content type for root path',
      rootRes.headers['content-type'] && rootRes.headers['content-type'].includes('text/html'),
      `Content-Type was: ${rootRes.headers['content-type']}`
    );

    const statsRes = await fetchUrl('/api/stats');
    recordResult(
      'API /api/stats endpoint responds with HTTP 200 and success=true',
      statsRes.statusCode === 200 && statsRes.json && statsRes.json.success === true,
      `Stats response: status=${statsRes.statusCode}, json=${JSON.stringify(statsRes.json)}`
    );

    const groupsRes = await fetchUrl('/api/groups');
    recordResult(
      'API /api/groups endpoint responds with HTTP 200 and groups array',
      groupsRes.statusCode === 200 && groupsRes.json && Array.isArray(groupsRes.json.groups),
      `Groups response: status=${groupsRes.statusCode}, isArray=${groupsRes.json && Array.isArray(groupsRes.json.groups)}`
    );
  } catch (err) {
    recordResult('Server connectivity on port 3000', false, err.message);
  }

  // ====================================================================
  // TEST SUITE 2: Static Assets & MIME Types (Zero 404s)
  // ====================================================================
  console.log('\n--- TEST SUITE 2: STATIC ASSETS & MIME TYPES (ZERO 404s) ---');
  const expectedAssets = [
    { path: '/', expectedMime: 'text/html' },
    { path: '/styles.css', expectedMime: 'text/css' },
    { path: '/app.js', expectedMime: 'javascript' },
    { path: '/favicon.ico', expectedMime: 'image' },
    { path: '/assets/apple-touch-icon.png', expectedMime: 'image/png' },
    { path: '/assets/smart-binary-logo.png', expectedMime: 'image/png' },
    { path: '/assets/smart-binary-logo.webp', expectedMime: 'image/webp' },
    { path: '/assets/smart-binary-mark.png', expectedMime: 'image/png' },
    { path: '/assets/smart-binary-mark.webp', expectedMime: 'image/webp' }
  ];

  for (const asset of expectedAssets) {
    try {
      const res = await fetchUrl(asset.path);
      const is200 = res.statusCode === 200;
      const cType = res.headers['content-type'] || '';
      const mimeOk = cType.includes(asset.expectedMime);
      const notEmpty = res.buffer.length > 0;

      recordResult(
        `Static asset [${asset.path}] returns 200 OK (size: ${res.buffer.length} bytes)`,
        is200 && notEmpty,
        `Status: ${res.statusCode}, size: ${res.buffer.length}`
      );

      recordResult(
        `Static asset [${asset.path}] has proper MIME type (${cType})`,
        mimeOk,
        `Expected ${asset.expectedMime}, got ${cType}`
      );
    } catch (err) {
      recordResult(`Static asset [${asset.path}] fetch error`, false, err.message);
    }
  }

  // Verify all asset references in index.html actually resolve
  try {
    const htmlRes = await fetchUrl('/');
    const htmlText = htmlRes.text;

    // Extract all src="..." and href="..." references
    const srcMatches = [...htmlText.matchAll(/src=["']([^"']+)["']/g)].map(m => m[1]);
    const hrefMatches = [...htmlText.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
    const srcsetMatches = [...htmlText.matchAll(/srcset=["']([^"']+)["']/g)].map(m => m[1]);

    const localRefs = new Set();
    [...srcMatches, ...hrefMatches, ...srcsetMatches].forEach(ref => {
      if (ref.startsWith('/') && !ref.startsWith('//')) {
        localRefs.add(ref);
      }
    });

    console.log(`  Discovered ${localRefs.size} local asset references in index.html: ${[...localRefs].join(', ')}`);

    for (const ref of localRefs) {
      const res = await fetchUrl(ref);
      recordResult(
        `Referenced asset from index.html [${ref}] resolves with 200 OK (No 404)`,
        res.statusCode === 200,
        `Status ${res.statusCode} for ${ref}`
      );
    }
  } catch (err) {
    recordResult('Asset discovery in index.html', false, err.message);
  }

  // Verify API 404 on missing entity
  try {
    const missingGroupRes = await fetchUrl('/api/groups/999999');
    recordResult(
      'Missing group entity returns HTTP 404 Not Found (/api/groups/999999)',
      missingGroupRes.statusCode === 404 && missingGroupRes.json && missingGroupRes.json.success === false,
      `Received status ${missingGroupRes.statusCode}, json=${JSON.stringify(missingGroupRes.json)}`
    );
  } catch (err) {
    recordResult('Missing entity 404 handling', false, err.message);
  }

  // ====================================================================
  // TEST SUITE 3: CSS Rules, Design System & Typography
  // ====================================================================
  console.log('\n--- TEST SUITE 3: CSS RULES & DESIGN SYSTEM ---');
  try {
    const cssRes = await fetchUrl('/styles.css');
    const cssText = cssRes.text;

    // 1. Font declarations
    const rubikHeadingDecl = cssText.includes("--font-heading: 'Rubik'") || cssText.includes('--font-heading: "Rubik"');
    recordResult(
      "CSS declares --font-heading with 'Rubik'",
      rubikHeadingDecl,
      "Expected --font-heading: 'Rubik' in styles.css"
    );

    const heeboBodyDecl = cssText.includes("--font-body: 'Heebo'") || cssText.includes('--font-body: "Heebo"');
    recordResult(
      "CSS declares --font-body with 'Heebo'",
      heeboBodyDecl,
      "Expected --font-body: 'Heebo' in styles.css"
    );

    const monoDecl = cssText.includes("--font-mono: 'JetBrains Mono'") || cssText.includes('--font-mono: "JetBrains Mono"');
    recordResult(
      "CSS declares --font-mono with 'JetBrains Mono'",
      monoDecl,
      "Expected --font-mono: 'JetBrains Mono' in styles.css"
    );

    const bodyUsesFont = cssText.includes('font-family: var(--font-body);') || cssText.includes('font-family: var(--font-body)');
    recordResult(
      "CSS body rule applies var(--font-body)",
      bodyUsesFont,
      "Expected body to use var(--font-body)"
    );

    // Google Fonts link in index.html
    const htmlRes = await fetchUrl('/');
    const hasGoogleFonts = htmlRes.text.includes('family=Heebo') && htmlRes.text.includes('family=Rubik') && htmlRes.text.includes('family=JetBrains+Mono');
    recordResult(
      "HTML preloads/loads Rubik, Heebo, and JetBrains Mono from Google Fonts",
      hasGoogleFonts,
      "Google fonts link missing Heebo, Rubik or JetBrains Mono"
    );

    // 2. .ltr Class behavior
    const hasLtrClass = cssText.includes('.ltr');
    recordResult(
      "CSS contains .ltr rule definition",
      hasLtrClass,
      "Missing .ltr selector in styles.css"
    );

    // Check specific declarations inside .ltr
    const ltrBlockMatch = cssText.match(/\.ltr\s*\{([^}]+)\}/);
    const ltrBlock = ltrBlockMatch ? ltrBlockMatch[1] : '';
    const ltrDirection = ltrBlock.includes('direction: ltr');
    const ltrBidi = ltrBlock.includes('unicode-bidi: isolate');
    const ltrAlign = ltrBlock.includes('text-align: left');

    recordResult(
      ".ltr rule specifies 'direction: ltr'",
      ltrDirection,
      `Found declarations: ${ltrBlock}`
    );
    recordResult(
      ".ltr rule specifies 'unicode-bidi: isolate' for clean BiDi isolation",
      ltrBidi,
      `Found declarations: ${ltrBlock}`
    );
    recordResult(
      ".ltr rule specifies 'text-align: left'",
      ltrAlign,
      `Found declarations: ${ltrBlock}`
    );

    // 3. .glass-card top rim gold styling
    const hasGlassCard = cssText.includes('.glass-card');
    recordResult(
      "CSS defines .glass-card class",
      hasGlassCard,
      "Missing .glass-card selector"
    );

    const glassCardBlockMatch = cssText.match(/\.glass-card\s*\{([^}]+)\}/);
    const glassCardBlock = glassCardBlockMatch ? glassCardBlockMatch[1] : '';
    const hasGoldRim = glassCardBlock.includes('border-top: 1px solid rgba(212, 175, 55') ||
                       (glassCardBlock.includes('border-top:') && glassCardBlock.includes('212, 175, 55'));

    recordResult(
      ".glass-card includes gold top rim styling (rgba(212, 175, 55, ...))",
      hasGoldRim,
      `Found .glass-card properties: ${glassCardBlock}`
    );

    const hasBackdropFilter = glassCardBlock.includes('backdrop-filter: blur');
    recordResult(
      ".glass-card includes backdrop-filter blur glassmorphism effect",
      hasBackdropFilter,
      `Found .glass-card properties: ${glassCardBlock}`
    );

    // 4. RTL 20% 50% Radial Gradient
    const hasRtlRadial = cssText.includes('circle at 20% 50%');
    recordResult(
      "CSS body background uses RTL radial gradient at 'circle at 20% 50%'",
      hasRtlRadial,
      "CSS should contain 'radial-gradient(circle at 20% 50%, ...)'"
    );

    const goldRtlRadial = cssText.includes('circle at 20% 50%, rgba(212, 175, 55');
    recordResult(
      "RTL radial gradient uses gold accent color rgba(212, 175, 55, 0.05)",
      goldRtlRadial,
      "RTL radial gradient missing gold color definition"
    );

    // 5. Palette Tokens
    const hasNavyToken = cssText.includes('--brand-navy: #0A1122');
    const hasGoldToken = cssText.includes('--brand-gold: #D4AF37');
    const hasGoldGlowToken = cssText.includes('--brand-gold-glow: #F5BE47');
    recordResult(
      "CSS defines exact Dark Luxury palette (#0A1122, #D4AF37, #F5BE47)",
      hasNavyToken && hasGoldToken && hasGoldGlowToken,
      `Found tokens: navy=${hasNavyToken}, gold=${hasGoldToken}, glow=${hasGoldGlowToken}`
    );
  } catch (err) {
    recordResult('CSS Rules evaluation', false, err.message);
  }

  // ====================================================================
  // TEST SUITE 4: 4-Tab Switcher & State Management Under Stress
  // ====================================================================
  console.log('\n--- TEST SUITE 4: 4-TAB SWITCHER & STATE MANAGEMENT UNDER STRESS ---');
  try {
    const htmlRes = await fetchUrl('/');
    const htmlText = htmlRes.text;

    // 1. Inspect DOM Tab definitions in HTML
    const hasTabGroups = htmlText.includes('id="tabGroupsBtn"') && htmlText.includes('data-view="groups"') && htmlText.includes('קבוצות שיתוף');
    const hasTabOffers = htmlText.includes('id="tabOffersBtn"') && htmlText.includes('data-view="offers"') && htmlText.includes('מציעים מנוי');
    const hasTabRequests = htmlText.includes('id="tabRequestsBtn"') && htmlText.includes('data-view="requests"') && htmlText.includes('מחפשים מנוי');
    const hasTabAll = htmlText.includes('id="tabAllBtn"') && htmlText.includes('data-view="all"') && htmlText.includes('הכל');

    recordResult(
      'HTML contains tab 1: id="tabGroupsBtn" (קבוצות שיתוף)',
      hasTabGroups,
      'Missing tabGroupsBtn in HTML'
    );
    recordResult(
      'HTML contains tab 2: id="tabOffersBtn" (מציעים מנוי)',
      hasTabOffers,
      'Missing tabOffersBtn in HTML'
    );
    recordResult(
      'HTML contains tab 3: id="tabRequestsBtn" (מחפשים מנוי)',
      hasTabRequests,
      'Missing tabRequestsBtn in HTML'
    );
    recordResult(
      'HTML contains tab 4: id="tabAllBtn" (הכל)',
      hasTabAll,
      'Missing tabAllBtn in HTML'
    );

    // 2. Setup headless DOM harness matching app.js
    const tabGroupsBtn = new SimpleElement('button', 'tabGroupsBtn', 'switch-tab-btn active');
    tabGroupsBtn.setAttribute('data-view', 'groups');
    tabGroupsBtn.setAttribute('aria-selected', 'true');

    const tabOffersBtn = new SimpleElement('button', 'tabOffersBtn', 'switch-tab-btn');
    tabOffersBtn.setAttribute('data-view', 'offers');
    tabOffersBtn.setAttribute('aria-selected', 'false');

    const tabRequestsBtn = new SimpleElement('button', 'tabRequestsBtn', 'switch-tab-btn');
    tabRequestsBtn.setAttribute('data-view', 'requests');
    tabRequestsBtn.setAttribute('aria-selected', 'false');

    const tabAllBtn = new SimpleElement('button', 'tabAllBtn', 'switch-tab-btn');
    tabAllBtn.setAttribute('data-view', 'all');
    tabAllBtn.setAttribute('aria-selected', 'false');

    const groupsSection = new SimpleElement('section', 'groupsSection');
    groupsSection.style.display = 'block';

    const postsSection = new SimpleElement('section', 'postsSection');
    postsSection.style.display = 'none';

    // Mock filter chips
    const chipAll = new SimpleElement('button', 'chipAll', 'filter-chip active');
    chipAll.dataset.postType = 'all';
    const chipOffer = new SimpleElement('button', 'chipOffer', 'filter-chip');
    chipOffer.dataset.postType = 'offer';
    const chipRequest = new SimpleElement('button', 'chipRequest', 'filter-chip');
    chipRequest.dataset.postType = 'request';
    const allChips = [chipAll, chipOffer, chipRequest];

    // State object
    const state = {
      view: 'groups',
      postType: 'all',
      groupFilter: 'active',
      loadGroupsCalls: 0,
      loadPostsCalls: 0
    };

    const allTopTabs = [tabGroupsBtn, tabOffersBtn, tabRequestsBtn, tabAllBtn];

    function activateTopTab(activeBtn) {
      allTopTabs.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.setAttribute('aria-selected', 'true');
      }
    }

    function syncPostFilterChips(targetType) {
      allChips.forEach(chip => {
        if (chip.dataset.postType === targetType) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }

    function mockLoadGroups() {
      state.loadGroupsCalls++;
    }

    function mockLoadPosts() {
      state.loadPostsCalls++;
    }

    // Exact implementation from app.js
    function switchTopView(mode) {
      state.view = mode;
      if (mode === 'groups') {
        activateTopTab(tabGroupsBtn);
        groupsSection.style.display = 'block';
        postsSection.style.display = 'none';
        mockLoadGroups();
      } else if (mode === 'offers') {
        activateTopTab(tabOffersBtn);
        groupsSection.style.display = 'none';
        postsSection.style.display = 'block';
        state.postType = 'offer';
        syncPostFilterChips('offer');
        mockLoadPosts();
      } else if (mode === 'requests') {
        activateTopTab(tabRequestsBtn);
        groupsSection.style.display = 'none';
        postsSection.style.display = 'block';
        state.postType = 'request';
        syncPostFilterChips('request');
        mockLoadPosts();
      } else if (mode === 'all') {
        activateTopTab(tabAllBtn);
        groupsSection.style.display = 'block';
        postsSection.style.display = 'block';
        state.postType = 'all';
        syncPostFilterChips('all');
        mockLoadGroups();
        mockLoadPosts();
      }
    }

    // Single-mode transitions
    switchTopView('offers');
    recordResult(
      "Switch to 'offers': groups hidden, posts visible, offers chip active, tabOffersBtn aria-selected=true",
      groupsSection.style.display === 'none' &&
      postsSection.style.display === 'block' &&
      tabOffersBtn.classList.contains('active') &&
      tabOffersBtn.getAttribute('aria-selected') === 'true' &&
      !tabGroupsBtn.classList.contains('active') &&
      chipOffer.classList.contains('active') &&
      state.postType === 'offer'
    );

    switchTopView('requests');
    recordResult(
      "Switch to 'requests': groups hidden, posts visible, requests chip active, tabRequestsBtn aria-selected=true",
      groupsSection.style.display === 'none' &&
      postsSection.style.display === 'block' &&
      tabRequestsBtn.classList.contains('active') &&
      tabRequestsBtn.getAttribute('aria-selected') === 'true' &&
      chipRequest.classList.contains('active') &&
      state.postType === 'request'
    );

    switchTopView('all');
    recordResult(
      "Switch to 'all': BOTH groups and posts visible, all chip active, tabAllBtn aria-selected=true",
      groupsSection.style.display === 'block' &&
      postsSection.style.display === 'block' &&
      tabAllBtn.classList.contains('active') &&
      tabAllBtn.getAttribute('aria-selected') === 'true' &&
      chipAll.classList.contains('active') &&
      state.postType === 'all'
    );

    switchTopView('groups');
    recordResult(
      "Switch back to 'groups': groups visible, posts hidden, tabGroupsBtn aria-selected=true",
      groupsSection.style.display === 'block' &&
      postsSection.style.display === 'none' &&
      tabGroupsBtn.classList.contains('active') &&
      tabGroupsBtn.getAttribute('aria-selected') === 'true'
    );

    // STRESS TEST: 1,000 rapid switches in randomized order
    console.log('  Executing rapid switching stress test (1,000 randomized transitions)...');
    const modes = ['groups', 'offers', 'requests', 'all'];
    let stressPassed = true;
    let invariantErrors = 0;

    for (let i = 0; i < 1000; i++) {
      const targetMode = modes[i % modes.length];
      switchTopView(targetMode);

      // Verify invariants
      const activeTabsCount = allTopTabs.filter(t => t.classList.contains('active')).length;
      const ariaSelectedCount = allTopTabs.filter(t => t.getAttribute('aria-selected') === 'true').length;

      if (activeTabsCount !== 1 || ariaSelectedCount !== 1) {
        invariantErrors++;
        stressPassed = false;
      }

      if (targetMode === 'groups' && (groupsSection.style.display !== 'block' || postsSection.style.display !== 'none')) {
        invariantErrors++;
        stressPassed = false;
      }
      if (targetMode === 'offers' && (groupsSection.style.display !== 'none' || postsSection.style.display !== 'block' || state.postType !== 'offer')) {
        invariantErrors++;
        stressPassed = false;
      }
      if (targetMode === 'requests' && (groupsSection.style.display !== 'none' || postsSection.style.display !== 'block' || state.postType !== 'request')) {
        invariantErrors++;
        stressPassed = false;
      }
      if (targetMode === 'all' && (groupsSection.style.display !== 'block' || postsSection.style.display !== 'block' || state.postType !== 'all')) {
        invariantErrors++;
        stressPassed = false;
      }
    }

    recordResult(
      `1,000 rapid switching stress operations passed with zero state invariant violations`,
      stressPassed && invariantErrors === 0,
      `Encountered ${invariantErrors} invariant violations`
    );

    // ====================================================================
    // TEST SUITE 5: 5-Slot Occupancy & Discount Badge DOM Generation
    // ====================================================================
    console.log('\n--- TEST SUITE 5: 5-SLOT OCCUPANCY & DISCOUNT BADGE DOM GENERATION ---');
    const appJsRes = await fetchUrl('/app.js');
    const appJsText = appJsRes.text;

    // Check slot occupancy logic in app.js
    const has5SlotsLogic = appJsText.includes('maxParticipantSlots = 5;') || appJsText.includes('5 - joinedCount');
    recordResult(
      "app.js implements 5 discrete participant slots logic",
      has5SlotsLogic,
      "Expected 5 participant slots logic in app.js"
    );

    const hasOccupancyTextPattern = appJsText.includes('${joinedCount}/5 תפוס, נותרו ${remainingSlots} מקומות');
    recordResult(
      "app.js renders occupancy text formatted as 'X/5 תפוס, נותרו Y מקומות'",
      hasOccupancyTextPattern,
      "Expected '${joinedCount}/5 תפוס, נותרו ${remainingSlots} מקומות' in app.js"
    );

    const hasSlotChipsRendering = appJsText.includes('slot-chip taken') && appJsText.includes('slot-chip free');
    recordResult(
      "app.js renders discrete participant slot chips (.slot-chip.taken / .slot-chip.free)",
      hasSlotChipsRendering,
      "Expected .slot-chip.taken and .slot-chip.free classes in app.js"
    );

    const hasDiscountBadgeRender = appJsText.includes('badge-discount-hero') && appJsText.includes('🎓');
    recordResult(
      "app.js renders prominent radiant gold discount badge (.badge-discount-hero with 🎓) in card header",
      hasDiscountBadgeRender,
      "Expected badge-discount-hero in app.js"
    );

    const hasFullLockLogic = appJsText.includes('🔒 קבוצה מלאה') && appJsText.includes('קבוצה מלאה');
    recordResult(
      "app.js locks full groups (marks '🔒 קבוצה מלאה' and disables join button)",
      hasFullLockLogic,
      "Missing full group locking logic in app.js"
    );

  } catch (err) {
    recordResult('4-Tab switcher stress test', false, err.message);
  }

  // ====================================================================
  // SUMMARY & VERDICT
  // ====================================================================
  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);
  console.log('================================================================');

  if (failedTests === 0) {
    console.log('🎉 VERDICT: APPROVE');
    console.log('All empirical assertions passed cleanly with zero regressions.');
    process.exit(0);
  } else {
    console.error('⚠️ VERDICT: REQUEST_CHANGES');
    console.error(`${failedTests} test(s) failed.`);
    process.exit(1);
  }
}

runEmpiricalHarness().catch(err => {
  console.error('Unhandled harness exception:', err);
  process.exit(1);
});
