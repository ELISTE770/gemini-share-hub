<?php
/**
 * Gemini Share Hub — Backend API (PHP + SQLite)
 * Self-contained server-side storage with zero external dependencies.
 */

declare(strict_types=1);

// Send JSON & CORS headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Master Admin PIN that bypasses any individual PIN check
const MASTER_PIN = '1123355';

// Database setup
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
    // Protect sqlite database file from direct browser download
    $htaccessContent = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\n";
    file_put_contents($dataDir . '/.htaccess', $htaccessContent);
}

$dbFile = $dataDir . '/gemini_share.sqlite';

// Verify write permissions early before SQLite locks
$isWriteAction = in_array($_GET['action'] ?? $_POST['action'] ?? '', [
    'create_post', 'delete_post', 'create_group', 'join_group',
    'approve_member', 'remove_member', 'close_group', 'reopen_group', 'delete_group'
], true);

if ($isWriteAction) {
    if (!is_writable($dataDir)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'שגיאת הרשאות בשרת: אין הרשאת כתיבה לתיקיית data. אנא הגדר ב-cPanel הרשאה 0777 לתיקיית data.'
        ]);
        exit;
    }
    if (file_exists($dbFile) && !is_writable($dbFile)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'שגיאת הרשאות בשרת: אין הרשאת כתיבה לקובץ gemini_share.sqlite. אנא הגדר ב-cPanel הרשאה 0666 או 0777 לקובץ data/gemini_share.sqlite.'
        ]);
        exit;
    }
}

try {
    $db = new PDO("sqlite:" . $dbFile, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 3,
    ]);
    $db->exec("PRAGMA busy_timeout = 3000;");
    $db->exec("PRAGMA journal_mode = DELETE;");
    $db->exec("PRAGMA synchronous = NORMAL;");
    $db->exec("PRAGMA foreign_keys = ON;");
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'שגיאת התחברות למסד הנתונים: ' . $e->getMessage()]);
    exit;
}

// Initialize tables if they do not exist
$db->exec("
    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('offer', 'request')),
        name TEXT,
        email TEXT NOT NULL,
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
        member_forum_user TEXT,
        status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved', 'pending')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);
    CREATE INDEX IF NOT EXISTS idx_members_group_id ON group_members(group_id);
");

// Helper: Read input data (supports JSON or Form POST)
function getInput(): array {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $json = json_decode($raw, true);
        if (is_array($json)) {
            return $json;
        }
    }
    return $_POST;
}

// Helper: Verify PIN with Master PIN fallback
function verifyPin(string $inputPin, string $hash): bool {
    $cleanPin = trim($inputPin);
    if ($cleanPin === MASTER_PIN) {
        return true;
    }
    if (empty($hash)) {
        return false;
    }
    return password_verify($cleanPin, $hash);
}

// Helper: Format group object with slots and member counts
function formatGroup(array $g, PDO $db, bool $isManager = false): array {
    $gid = (int)$g['id'];
    $stmt = $db->prepare("SELECT * FROM group_members WHERE group_id = ? ORDER BY id ASC");
    $stmt->execute([$gid]);
    $allMembers = $stmt->fetchAll();

    $approved = [];
    $pending = [];
    foreach ($allMembers as $m) {
        if ($m['status'] === 'approved') {
            $approved[] = $m;
        } else {
            $pending[] = $m;
        }
    }

    $membersCount = count($approved);
    $pendingCount = count($pending);
    $totalSlots = (int)($g['total_slots'] ?? 6);
    $slotsTaken = 1 + $membersCount;
    $slotsFree = max(0, $totalSlots - $slotsTaken);

    // Privacy masking for public viewers
    $publicMembers = [];
    if (!$isManager && (int)$g['private_members'] === 1) {
        for ($i = 0; $i < $membersCount; $i++) {
            $publicMembers[] = [
                'member_name' => 'משתתף חסוי',
                'member_email' => '*** חסוי',
                'member_forum_user' => null,
                'created_at' => null
            ];
        }
    } else {
        $publicMembers = $approved;
    }

    $result = [
        'id' => $gid,
        'title' => $g['title'],
        'manager_name' => $g['manager_name'],
        'manager_email' => $isManager ? $g['manager_email'] : ($g['private_members'] ? '*** חסוי' : $g['manager_email']),
        'manager_forum_user' => $g['manager_forum_user'],
        'has_discount' => (bool)$g['has_discount'],
        'discount_label' => $g['discount_label'],
        'cost_per_member' => $g['cost_per_member'],
        'total_slots' => $totalSlots,
        'require_approval' => (bool)$g['require_approval'],
        'private_members' => (bool)$g['private_members'],
        'requirements' => $g['requirements'],
        'prepay_required' => (bool)$g['prepay_required'],
        'prepay_months' => (int)$g['prepay_months'],
        'notes' => $g['notes'],
        'status' => $g['status'],
        'created_at' => $g['created_at'],
        'members_count' => $membersCount,
        'pending_count' => $pendingCount,
        'slots_taken' => $slotsTaken,
        'slots_free' => $slotsFree,
        'needed_members' => $totalSlots - 1,
        'members' => $publicMembers
    ];

    if ($isManager) {
        $result['pending_members'] = $pending;
    }

    return $result;
}

// Route action
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = getInput();

try {
    switch ($action) {

        // ==========================================
        // 1. GET POSTS (מודעות אישיות)
        // ==========================================
        case 'posts':
            $type = $_GET['type'] ?? 'all';
            $costType = $_GET['cost_type'] ?? 'all';
            $search = trim((string)($_GET['search'] ?? ''));

            $sql = "SELECT id, type, name, email, forum_user, cost_type, notes, status, created_at FROM posts WHERE status = 'active'";
            $params = [];

            if ($type !== 'all' && in_array($type, ['offer', 'request'], true)) {
                $sql .= " AND type = ?";
                $params[] = $type;
            }

            if ($costType !== 'all' && in_array($costType, ['free', 'paid'], true)) {
                $sql .= " AND cost_type = ?";
                $params[] = $costType;
            }

            if (!empty($search)) {
                $sql .= " AND (notes LIKE ? OR email LIKE ? OR name LIKE ? OR forum_user LIKE ?)";
                $term = "%{$search}%";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }

            $sql .= " ORDER BY id DESC LIMIT 100";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $posts = $stmt->fetchAll();

            echo json_encode(['success' => true, 'posts' => $posts]);
            break;

        // ==========================================
        // 2. CREATE POST
        // ==========================================
        case 'create_post':
            if (!empty($input['website'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'פעילות אוטומטית נדחתה']);
                exit;
            }

            $type = (string)($input['type'] ?? '');
            $name = trim((string)($input['name'] ?? ''));
            $email = trim(strtolower((string)($input['email'] ?? '')));
            $forumUser = trim(ltrim((string)($input['forum_user'] ?? ''), '@'));
            $costType = (string)($input['cost_type'] ?? '');
            $notes = trim((string)($input['notes'] ?? ''));
            $pin = trim((string)($input['pin'] ?? ''));

            if (!in_array($type, ['offer', 'request'], true)) {
                throw new Exception('נא לבחור האם מדובר בהצעת מנוי או בבקשה להצטרף');
            }
            if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new Exception('כתובת אימייל אינה תקינה');
            }
            if (!in_array($costType, ['free', 'paid'], true)) {
                throw new Exception('נא לבחור סוג עלות (חינם או חלוקת עלויות)');
            }
            if (strlen($pin) < 4) {
                throw new Exception('קוד סודי (PIN) חייב להכיל לפחות 4 תווים');
            }

            $pinHash = password_hash($pin, PASSWORD_BCRYPT);
            $stmt = $db->prepare("
                INSERT INTO posts (type, name, email, forum_user, cost_type, notes, pin_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $type,
                mb_substr($name, 0, 50),
                $email,
                !empty($forumUser) ? mb_substr($forumUser, 0, 40) : null,
                $costType,
                mb_substr($notes, 0, 500),
                $pinHash
            ]);

            $newId = (int)$db->lastInsertId();
            $getStmt = $db->prepare("SELECT id, type, name, email, forum_user, cost_type, notes, status, created_at FROM posts WHERE id = ?");
            $getStmt->execute([$newId]);

            echo json_encode(['success' => true, 'post' => $getStmt->fetch()]);
            break;

        // ==========================================
        // 3. DELETE POST
        // ==========================================
        case 'delete_post':
            $id = (int)($input['id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            if ($id <= 0 || empty($pin)) {
                throw new Exception('פרטי מחיקה חסרים');
            }

            $stmt = $db->prepare("SELECT id, pin_hash FROM posts WHERE id = ?");
            $stmt->execute([$id]);
            $post = $stmt->fetch();

            if (!$post) {
                throw new Exception('המודעה לא נמצאה');
            }
            if (!verifyPin($pin, $post['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד סודי (PIN) שגוי']);
                exit;
            }

            $delStmt = $db->prepare("DELETE FROM posts WHERE id = ?");
            $delStmt->execute([$id]);

            echo json_encode(['success' => true, 'message' => 'המודעה הוסרה בהצלחה']);
            break;

        // ==========================================
        // 4. GET GROUPS (קבוצות שיתוף)
        // ==========================================
        case 'groups':
            $status = $_GET['status'] ?? 'all';
            $hasDiscount = $_GET['has_discount'] ?? 'all';
            $search = trim((string)($_GET['search'] ?? ''));

            $sql = "SELECT * FROM groups WHERE 1=1";
            $params = [];

            if ($status === 'open') {
                $sql .= " AND status = 'open'";
            }

            if ($hasDiscount === 'true') {
                $sql .= " AND has_discount = 1";
            }

            if (!empty($search)) {
                $sql .= " AND (title LIKE ? OR manager_name LIKE ? OR notes LIKE ? OR manager_forum_user LIKE ?)";
                $term = "%{$search}%";
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
                $params[] = $term;
            }

            $sql .= " ORDER BY id DESC LIMIT 100";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $rawGroups = $stmt->fetchAll();

            $formatted = [];
            foreach ($rawGroups as $rg) {
                $formatted[] = formatGroup($rg, $db, false);
            }

            echo json_encode(['success' => true, 'groups' => $formatted]);
            break;

        // ==========================================
        // 5. CREATE GROUP
        // ==========================================
        case 'create_group':
            if (!empty($input['website'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'פעילות אוטומטית נדחתה']);
                exit;
            }

            $managerName = trim((string)($input['manager_name'] ?? ''));
            $managerEmail = trim(strtolower((string)($input['manager_email'] ?? '')));
            $managerForumUser = trim(ltrim((string)($input['manager_forum_user'] ?? ''), '@'));
            $hasDiscount = !empty($input['has_discount']) ? 1 : 0;
            $discountLabel = trim((string)($input['discount_label'] ?? ''));
            $costPerMember = trim((string)($input['cost_per_member'] ?? ''));
            $totalSlots = 6;
            $requireApproval = !empty($input['require_approval']) ? 1 : 0;
            $privateMembers = !empty($input['private_members']) ? 1 : 0;
            $requirements = trim((string)($input['requirements'] ?? ''));
            $prepayRequired = !empty($input['prepay_required']) ? 1 : 0;
            $prepayMonths = max(1, min(24, (int)($input['prepay_months'] ?? 1)));
            $notes = trim((string)($input['notes'] ?? ''));
            $pin = trim((string)($input['pin'] ?? ''));
            $customTitle = trim((string)($input['title'] ?? ''));

            if (empty($managerName)) {
                if (!empty($managerForumUser)) {
                    $managerName = $managerForumUser;
                } elseif (!empty($managerEmail)) {
                    $managerName = explode('@', $managerEmail)[0];
                } else {
                    throw new Exception('שם מנהל הקבוצה הוא שדה חובה');
                }
            }
            if (empty($managerEmail) || !filter_var($managerEmail, FILTER_VALIDATE_EMAIL)) {
                throw new Exception('כתובת אימייל אינה תקינה');
            }
            if (strlen($pin) < 4) {
                throw new Exception('קוד ניהול (PIN) חייב להכיל לפחות 4 תווים');
            }

            $discTag = !empty($discountLabel) ? $discountLabel : 'מחיר מוזל (סטודנט וכו\')';
            if (empty($customTitle)) {
                $title = $hasDiscount ? "🎓 [{$discTag}] קבוצת שיתוף — {$managerName}" : "👥 קבוצת שיתוף עלויות — {$managerName}";
            } else {
                $title = ($hasDiscount && !str_contains($customTitle, '🎓')) ? "🎓 [{$discTag}] {$customTitle}" : $customTitle;
            }

            $pinHash = password_hash($pin, PASSWORD_BCRYPT);

            $stmt = $db->prepare("
                INSERT INTO groups (
                    title, manager_name, manager_email, manager_forum_user, has_discount,
                    discount_label, cost_per_member, total_slots, require_approval,
                    private_members, requirements, prepay_required, prepay_months,
                    notes, pin_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            $stmt->execute([
                mb_substr($title, 0, 100),
                mb_substr($managerName, 0, 50),
                $managerEmail,
                !empty($managerForumUser) ? mb_substr($managerForumUser, 0, 40) : null,
                $hasDiscount,
                !empty($discountLabel) ? mb_substr($discountLabel, 0, 60) : ($hasDiscount ? 'הנחת סטודנט / מחיר מוזל' : null),
                !empty($costPerMember) ? mb_substr($costPerMember, 0, 40) : null,
                $totalSlots,
                $requireApproval,
                $privateMembers,
                !empty($requirements) ? mb_substr($requirements, 0, 500) : null,
                $prepayRequired,
                $prepayMonths,
                mb_substr($notes, 0, 500),
                $pinHash
            ]);

            $newGroupId = (int)$db->lastInsertId();
            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$newGroupId]);

            echo json_encode(['success' => true, 'group' => formatGroup($stmt->fetch(), $db, false)]);
            break;

        // ==========================================
        // 6. JOIN GROUP
        // ==========================================
        case 'join_group':
            $groupId = (int)($input['group_id'] ?? 0);
            $memberName = trim((string)($input['member_name'] ?? ''));
            $memberEmail = trim(strtolower((string)($input['member_email'] ?? '')));
            $memberForumUser = trim(ltrim((string)($input['member_forum_user'] ?? ''), '@'));
            $notes = trim((string)($input['notes'] ?? ''));

            if ($groupId <= 0) throw new Exception('מזהה קבוצה שגוי');
            if (empty($memberName)) {
                if (!empty($memberForumUser)) {
                    $memberName = $memberForumUser;
                } elseif (!empty($memberEmail)) {
                    $memberName = explode('@', $memberEmail)[0];
                } else {
                    throw new Exception('נא להזין שם או כינוי');
                }
            }
            if (empty($memberEmail) || !filter_var($memberEmail, FILTER_VALIDATE_EMAIL)) throw new Exception('כתובת אימייל אינה תקינה');

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if ($group['status'] === 'closed') throw new Exception('קבוצה זו סגורה להצטרפות');

            // Count approved members
            $cntStmt = $db->prepare("SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'");
            $cntStmt->execute([$groupId]);
            $approvedCount = (int)$cntStmt->fetch()['cnt'];

            if (1 + $approvedCount >= (int)$group['total_slots']) {
                throw new Exception('כל המקומות בקבוצה זו נתפסו');
            }

            // Check duplicate
            if ($memberEmail === strtolower($group['manager_email'])) {
                throw new Exception('כתובת המייל הזו היא של מנהל הקבוצה');
            }
            $dupStmt = $db->prepare("SELECT id FROM group_members WHERE group_id = ? AND lower(member_email) = ?");
            $dupStmt->execute([$groupId, $memberEmail]);
            if ($dupStmt->fetch()) {
                throw new Exception('כתובת מייל זו כבר נרשמה לקבוצה זו');
            }

            $status = ((int)$group['require_approval'] === 1) ? 'pending' : 'approved';

            $insStmt = $db->prepare("
                INSERT INTO group_members (group_id, member_name, member_email, member_forum_user, status, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $insStmt->execute([
                $groupId,
                mb_substr($memberName, 0, 50),
                $memberEmail,
                !empty($memberForumUser) ? mb_substr($memberForumUser, 0, 40) : null,
                $status,
                mb_substr($notes, 0, 300)
            ]);

            // If newly approved filled up group, update status
            if ($status === 'approved' && (1 + $approvedCount + 1) >= (int)$group['total_slots']) {
                $updStmt = $db->prepare("UPDATE groups SET status = 'full', updated_at = datetime('now', 'localtime') WHERE id = ?");
                $updStmt->execute([$groupId]);
            }

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);

            echo json_encode([
                'success' => true,
                'isPending' => ($status === 'pending'),
                'message' => ($status === 'pending') ? 'בקשתך נרשמה בהצלחה וממתינה לאישור המנהל' : 'הצטרפת לקבוצה בהצלחה!',
                'group' => formatGroup($stmt->fetch(), $db, false)
            ]);
            break;

        // ==========================================
        // 7. GROUP ADMIN DASHBOARD
        // ==========================================
        case 'group_admin':
            $groupId = (int)($input['group_id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            if ($groupId <= 0 || empty($pin)) throw new Exception('פרטי אימות חסרים');

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if (!verifyPin($pin, $group['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד ניהול (PIN) שגוי']);
                exit;
            }

            echo json_encode([
                'success' => true,
                'group' => formatGroup($group, $db, true)
            ]);
            break;

        // ==========================================
        // 8. APPROVE MEMBER
        // ==========================================
        case 'approve_member':
            $groupId = (int)($input['group_id'] ?? 0);
            $memberId = (int)($input['member_id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if (!verifyPin($pin, $group['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד שגוי']);
                exit;
            }

            $cntStmt = $db->prepare("SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'");
            $cntStmt->execute([$groupId]);
            $approvedCount = (int)$cntStmt->fetch()['cnt'];

            if (1 + $approvedCount >= (int)$group['total_slots']) {
                throw new Exception('הקבוצה מלאה, לא ניתן לאשר חברים נוספים');
            }

            $updStmt = $db->prepare("UPDATE group_members SET status = 'approved' WHERE id = ? AND group_id = ?");
            $updStmt->execute([$memberId, $groupId]);

            if (1 + $approvedCount + 1 >= (int)$group['total_slots']) {
                $db->prepare("UPDATE groups SET status = 'full', updated_at = datetime('now', 'localtime') WHERE id = ?")->execute([$groupId]);
            }

            echo json_encode(['success' => true, 'message' => 'המשתתף אושר בהצלחה ונוסף לקבוצה']);
            break;

        // ==========================================
        // 9. REMOVE MEMBER
        // ==========================================
        case 'remove_member':
            $groupId = (int)($input['group_id'] ?? 0);
            $memberId = (int)($input['member_id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if (!verifyPin($pin, $group['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד שגוי']);
                exit;
            }

            $delStmt = $db->prepare("DELETE FROM group_members WHERE id = ? AND group_id = ?");
            $delStmt->execute([$memberId, $groupId]);

            // Reopen if slots became free
            $cntStmt = $db->prepare("SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'");
            $cntStmt->execute([$groupId]);
            $approvedCount = (int)$cntStmt->fetch()['cnt'];

            if (1 + $approvedCount < (int)$group['total_slots'] && $group['status'] === 'full') {
                $db->prepare("UPDATE groups SET status = 'open', updated_at = datetime('now', 'localtime') WHERE id = ?")->execute([$groupId]);
            }

            echo json_encode(['success' => true, 'message' => 'המשתתף הוסר מהקבוצה בהצלחה']);
            break;

        // ==========================================
        // 10. TOGGLE CLOSE / REOPEN GROUP
        // ==========================================
        case 'close_group':
        case 'reopen_group':
            $groupId = (int)($input['group_id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if (!verifyPin($pin, $group['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד שגוי']);
                exit;
            }

            if ($action === 'close_group') {
                $newStatus = 'closed';
            } else {
                $cntStmt = $db->prepare("SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND status = 'approved'");
                $cntStmt->execute([$groupId]);
                $cnt = (int)$cntStmt->fetch()['cnt'];
                $newStatus = (1 + $cnt >= (int)$group['total_slots']) ? 'full' : 'open';
            }

            $db->prepare("UPDATE groups SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")->execute([$newStatus, $groupId]);

            echo json_encode(['success' => true, 'status' => $newStatus]);
            break;

        // ==========================================
        // 11. DELETE GROUP
        // ==========================================
        case 'delete_group':
            $groupId = (int)($input['group_id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            $stmt = $db->prepare("SELECT * FROM groups WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if (!verifyPin($pin, $group['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד שגוי']);
                exit;
            }

            $db->prepare("DELETE FROM groups WHERE id = ?")->execute([$groupId]);
            echo json_encode(['success' => true, 'message' => 'הקבוצה נמחקה לצמיתות']);
            break;

        // ==========================================
        // 12. STATS (סטטיסטיקות כלליות)
        // ==========================================
        case 'stats':
            $offers = (int)$db->query("SELECT COUNT(*) FROM posts WHERE status = 'active' AND type = 'offer'")->fetchColumn();
            $requests = (int)$db->query("SELECT COUNT(*) FROM posts WHERE status = 'active' AND type = 'request'")->fetchColumn();
            $groups = (int)$db->query("SELECT COUNT(*) FROM groups WHERE status IN ('open', 'full')")->fetchColumn();
            echo json_encode([
                'success' => true,
                'stats' => [
                    'offers' => $offers,
                    'requests' => $requests,
                    'groups' => $groups
                ]
            ]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'פעולה לא מוכרת']);
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
