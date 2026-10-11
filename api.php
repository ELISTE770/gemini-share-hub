<?php
/**
 * Gemini Share Hub — Backend API (PHP + MySQL & SQLite Dual-Engine)
 * Auto-detects and connects to MySQL with automatic fallback to SQLite.
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

// Load Configuration
$config = file_exists(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$masterPin = (string)($config['master_pin'] ?? '1123355');
const MASTER_PIN = '1123355';

// Database Initialization (MySQL Primary with Auto-Detection & SQLite Fallback)
$db = null;
$dbType = 'none';
$dbNameUsed = '';
$initError = '';

$driverPref = strtolower($config['driver'] ?? 'mysql');

if ($driverPref === 'mysql') {
    $m = $config['mysql'] ?? [];
    $host = $m['host'] ?? 'localhost';
    $port = (int)($m['port'] ?? 3306);
    $user = $m['user'] ?? 'eliste';
    $pass = $m['pass'] ?? 'Aa@smartbinary';
    $dbname = $m['dbname'] ?? 'eliste';

    // cPanel user variations
    $usersToTry = array_unique(array_filter([
        $user,
        $user . '_' . $user,
        $user . '_gemini',
        $user . '_db',
        $user . '_admin'
    ]));

    $pdo = null;
    $connectedUser = null;

    foreach ($usersToTry as $tryUser) {
        foreach ([$host, '127.0.0.1'] as $tryHost) {
            try {
                $dsn = "mysql:host={$tryHost};port={$port};charset=utf8mb4";
                $testPdo = new PDO($dsn, $tryUser, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => 3
                ]);
                $pdo = $testPdo;
                $connectedUser = $tryUser;
                break 2;
            } catch (Exception $e) {
                $initError = $e->getMessage();
            }
        }
    }

    if (!$pdo) {
        // Try connecting directly with specific dbname
        $dbsToTry = array_unique(array_filter([
            $dbname,
            $user . '_' . $dbname,
            $user . '_gemini',
            $user . '_' . $user,
            $user . '_db'
        ]));
        foreach ($dbsToTry as $tryDb) {
            foreach ($usersToTry as $tryUser) {
                foreach ([$host, '127.0.0.1'] as $tryHost) {
                    try {
                        $dsn = "mysql:host={$tryHost};port={$port};dbname={$tryDb};charset=utf8mb4";
                        $pdo = new PDO($dsn, $tryUser, $pass, [
                            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                            PDO::ATTR_TIMEOUT => 3
                        ]);
                        $connectedUser = $tryUser;
                        $selectedDb = $tryDb;
                        break 3;
                    } catch (Exception $e) {
                        $initError = $e->getMessage();
                    }
                }
            }
        }
    }

    if ($pdo) {
        if (empty($selectedDb)) {
            $selectedDb = null;
            try {
                $dbs = $pdo->query("SHOW DATABASES")->fetchAll(PDO::FETCH_COLUMN);
                $userDbs = array_values(array_filter($dbs, function($d) {
                    return !in_array(strtolower($d), ['information_schema', 'performance_schema', 'sys', 'mysql']);
                }));
                if (!empty($userDbs)) {
                    foreach ($userDbs as $udb) {
                        if ($udb === $dbname || str_contains($udb, $dbname) || str_contains($udb, 'gemini')) {
                            $selectedDb = $udb;
                            break;
                        }
                    }
                    if (!$selectedDb) $selectedDb = $userDbs[0];
                }
            } catch (Exception $e) {}

            if (!$selectedDb) {
                $dbsToTry = array_unique(array_filter([
                    $dbname,
                    $user . '_' . $dbname,
                    $user . '_gemini',
                    $user . '_' . $user,
                    $user . '_db'
                ]));
                foreach ($dbsToTry as $tryDb) {
                    try {
                        $pdo->exec("USE `$tryDb`");
                        $selectedDb = $tryDb;
                        break;
                    } catch (Exception $e) {}
                }
            } else {
                $pdo->exec("USE `$selectedDb`");
            }
        }

        if ($selectedDb) {
            $db = $pdo;
            $dbType = 'mysql';
            $dbNameUsed = $selectedDb;

            // Initialize MySQL Tables
            $db->exec("
                CREATE TABLE IF NOT EXISTS posts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    type VARCHAR(20) NOT NULL,
                    name VARCHAR(100) NULL,
                    email VARCHAR(255) NOT NULL,
                    forum_user VARCHAR(100) NULL,
                    cost_type VARCHAR(20) NOT NULL,
                    notes TEXT NULL,
                    pin_hash VARCHAR(255) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'active',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_posts_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `groups` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    manager_name VARCHAR(100) NOT NULL,
                    manager_email VARCHAR(255) NOT NULL,
                    manager_forum_user VARCHAR(100) NULL,
                    has_discount TINYINT(1) NOT NULL DEFAULT 0,
                    discount_label VARCHAR(100) NULL,
                    cost_per_member VARCHAR(50) NULL,
                    total_slots INT NOT NULL DEFAULT 6,
                    require_approval TINYINT(1) NOT NULL DEFAULT 0,
                    private_members TINYINT(1) NOT NULL DEFAULT 0,
                    requirements TEXT NULL,
                    prepay_required TINYINT(1) NOT NULL DEFAULT 0,
                    prepay_months INT NOT NULL DEFAULT 1,
                    notes TEXT NULL,
                    pin_hash VARCHAR(255) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'open',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_groups_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS group_members (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    group_id INT NOT NULL,
                    member_name VARCHAR(100) NOT NULL,
                    member_email VARCHAR(255) NOT NULL,
                    member_forum_user VARCHAR(100) NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'approved',
                    notes TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_members_group_id (group_id),
                    CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        }
    }
}

// Fallback to SQLite if MySQL is not available or failed
if (!$db) {
    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0777, true);
        $htaccessContent = "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\n";
        file_put_contents($dataDir . '/.htaccess', $htaccessContent);
    }

    $dbFile = $dataDir . '/gemini_share.sqlite';

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

        $db->exec("
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                name TEXT,
                email TEXT NOT NULL,
                forum_user TEXT,
                cost_type TEXT NOT NULL,
                notes TEXT,
                pin_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS `groups` (
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
                status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS group_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL REFERENCES `groups`(id) ON DELETE CASCADE,
                member_name TEXT NOT NULL,
                member_email TEXT NOT NULL,
                member_forum_user TEXT,
                status TEXT NOT NULL DEFAULT 'approved',
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
        ");

        $dbType = 'sqlite';
        $dbNameUsed = 'gemini_share.sqlite';
    } catch (Exception $e) {
        http_response_code(500);
        $err = "שגיאת התחברות למסד הנתונים: " . ($initError ? "MySQL: $initError | SQLite: " : '') . $e->getMessage();
        echo json_encode(['success' => false, 'error' => $err]);
        exit;
    }
}

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
    $slotsTaken = 1 + $membersCount; // 1 manager + approved members
    $slotsFree = max(0, $totalSlots - $slotsTaken);

    $publicMembers = [];
    $isPrivate = !empty($g['private_members']);

    foreach ($approved as $m) {
        if ($isManager || !$isPrivate) {
            $publicMembers[] = [
                'id' => (int)$m['id'],
                'member_name' => $m['member_name'],
                'member_email' => $isManager ? $m['member_email'] : maskEmail($m['member_email']),
                'member_forum_user' => $m['member_forum_user'] ?? null,
                'created_at' => $m['created_at']
            ];
        } else {
            $publicMembers[] = [
                'id' => (int)$m['id'],
                'member_name' => 'משתתף חסוי',
                'member_email' => '***@***',
                'member_forum_user' => null,
                'created_at' => $m['created_at']
            ];
        }
    }

    $result = [
        'id' => $gid,
        'title' => $g['title'],
        'manager_name' => $g['manager_name'],
        'manager_email' => $isManager ? $g['manager_email'] : maskEmail($g['manager_email']),
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

function maskEmail(string $email): string {
    $parts = explode('@', $email);
    if (count($parts) !== 2) return '***@***';
    $name = $parts[0];
    $domain = $parts[1];
    $maskedName = mb_substr($name, 0, 2) . '***';
    return $maskedName . '@' . $domain;
}

// Route action
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = getInput();
$now = date('Y-m-d H:i:s');

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
                INSERT INTO posts (type, name, email, forum_user, cost_type, notes, pin_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $type,
                mb_substr($name, 0, 50),
                $email,
                !empty($forumUser) ? mb_substr($forumUser, 0, 40) : null,
                $costType,
                mb_substr($notes, 0, 500),
                $pinHash,
                $now,
                $now
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

            $sql = "SELECT * FROM `groups` WHERE 1=1";
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
                INSERT INTO `groups` (
                    title, manager_name, manager_email, manager_forum_user, has_discount,
                    discount_label, cost_per_member, total_slots, require_approval,
                    private_members, requirements, prepay_required, prepay_months,
                    notes, pin_hash, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            $stmt->execute([
                mb_substr($title, 0, 150),
                mb_substr($managerName, 0, 50),
                $managerEmail,
                !empty($managerForumUser) ? mb_substr($managerForumUser, 0, 40) : null,
                $hasDiscount,
                mb_substr($discountLabel, 0, 80),
                mb_substr($costPerMember, 0, 30),
                $totalSlots,
                $requireApproval,
                $privateMembers,
                mb_substr($requirements, 0, 300),
                $prepayRequired,
                $prepayMonths,
                mb_substr($notes, 0, 500),
                $pinHash,
                $now,
                $now
            ]);

            $newGroupId = (int)$db->lastInsertId();
            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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
                INSERT INTO group_members (group_id, member_name, member_email, member_forum_user, status, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $insStmt->execute([
                $groupId,
                mb_substr($memberName, 0, 50),
                $memberEmail,
                !empty($memberForumUser) ? mb_substr($memberForumUser, 0, 40) : null,
                $status,
                mb_substr($notes, 0, 300),
                $now
            ]);

            // If newly approved filled up group, update status
            if ($status === 'approved' && (1 + $approvedCount + 1) >= (int)$group['total_slots']) {
                $updStmt = $db->prepare("UPDATE `groups` SET status = 'full', updated_at = ? WHERE id = ?");
                $updStmt->execute([$now, $groupId]);
            }

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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
                $db->prepare("UPDATE `groups` SET status = 'full', updated_at = ? WHERE id = ?")->execute([$now, $groupId]);
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

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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
                $db->prepare("UPDATE `groups` SET status = 'open', updated_at = ? WHERE id = ?")->execute([$now, $groupId]);
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

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
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

            $db->prepare("UPDATE `groups` SET status = ?, updated_at = ? WHERE id = ?")->execute([$newStatus, $now, $groupId]);

            echo json_encode(['success' => true, 'status' => $newStatus]);
            break;

        // ==========================================
        // 11. DELETE GROUP
        // ==========================================
        case 'delete_group':
            $groupId = (int)($input['group_id'] ?? 0);
            $pin = trim((string)($input['pin'] ?? ''));

            $stmt = $db->prepare("SELECT * FROM `groups` WHERE id = ?");
            $stmt->execute([$groupId]);
            $group = $stmt->fetch();
            if (!$group) throw new Exception('הקבוצה לא נמצאה');

            if (!verifyPin($pin, $group['pin_hash'])) {
                http_response_code(401);
                echo json_encode(['success' => false, 'error' => 'קוד שגוי']);
                exit;
            }

            $db->prepare("DELETE FROM `groups` WHERE id = ?")->execute([$groupId]);
            echo json_encode(['success' => true, 'message' => 'הקבוצה נמחקה לצמיתות']);
            break;

        // ==========================================
        // 12. STATS (סטטיסטיקות כלליות)
        // ==========================================
        case 'stats':
            $offers = (int)$db->query("SELECT COUNT(*) FROM posts WHERE status = 'active' AND type = 'offer'")->fetchColumn();
            $requests = (int)$db->query("SELECT COUNT(*) FROM posts WHERE status = 'active' AND type = 'request'")->fetchColumn();
            $groups = (int)$db->query("SELECT COUNT(*) FROM `groups` WHERE status IN ('open', 'full')")->fetchColumn();
            echo json_encode([
                'success' => true,
                'stats' => [
                    'offers' => $offers,
                    'requests' => $requests,
                    'groups' => $groups
                ],
                'engine' => $dbType,
                'database' => $dbNameUsed
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
