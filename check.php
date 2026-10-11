<?php
/**
 * Gemini Share Hub — בדיקת שרת מקיפה (Server Diagnostics: MySQL & SQLite)
 * פתח קובץ זה בדפדפן (לדוגמה: https://yourdomain.com/check.php) לבדיקה מהירה.
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');

$config = file_exists(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$results = [];

// 1. PHP Version
$phpVersion = PHP_VERSION;
$results[] = [
    'title' => 'גרסת PHP',
    'status' => version_compare($phpVersion, '7.4.0', '>=') ? 'ok' : 'error',
    'detail' => "גרסה נוכחית: $phpVersion (נדרש 7.4 ומעלה)"
];

// 2. PDO Drivers
$drivers = PDO::getAvailableDrivers();
$hasMysql = in_array('mysql', $drivers, true);
$hasSqlite = in_array('sqlite', $drivers, true);

$results[] = [
    'title' => 'דרייברים של מסדי נתונים (PDO Drivers)',
    'status' => $hasMysql ? 'ok' : 'error',
    'detail' => "MySQL: " . ($hasMysql ? 'מותקן ופעיל ✅' : 'חסר ❌') . " | SQLite: " . ($hasSqlite ? 'מותקן ופעיל ✅' : 'לא פעיל')
];

// 3. MySQL Connection Test
$mysqlConnected = false;
$mysqlDbFound = null;
$mysqlError = null;

if ($hasMysql) {
    $m = $config['mysql'] ?? [];
    $host = $m['host'] ?? 'localhost';
    $port = (int)($m['port'] ?? 3306);
    $user = $m['user'] ?? 'eliste';
    $pass = $m['pass'] ?? 'Aa@smartbinary';
    $dbname = $m['dbname'] ?? 'eliste';

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
                    PDO::ATTR_TIMEOUT => 3
                ]);
                $pdo = $testPdo;
                $connectedUser = $tryUser;
                break 2;
            } catch (Exception $e) {
                $mysqlError = $e->getMessage();
            }
        }
    }

    if ($pdo) {
        $mysqlConnected = true;
        // Search available user databases
        try {
            $dbs = $pdo->query("SHOW DATABASES")->fetchAll(PDO::FETCH_COLUMN);
            $userDbs = array_values(array_filter($dbs, function($d) {
                return !in_array(strtolower($d), ['information_schema', 'performance_schema', 'sys', 'mysql']);
            }));
            if (!empty($userDbs)) {
                $mysqlDbFound = implode(', ', $userDbs);
            }
        } catch (Exception $e) {}

        if (!$mysqlDbFound) {
            $dbsToTry = array_unique(array_filter([$dbname, $user . '_' . $dbname, $user . '_gemini', $user . '_' . $user]));
            foreach ($dbsToTry as $tdb) {
                try {
                    $pdo->exec("USE `$tdb`");
                    $mysqlDbFound = $tdb;
                    break;
                } catch (Exception $e) {}
            }
        }
    }
}

$results[] = [
    'title' => 'חיבור ל-MySQL (שרת cPanel)',
    'status' => $mysqlConnected ? 'ok' : 'error',
    'detail' => $mysqlConnected 
        ? "התחבר בהצלחה עם משתמש '$connectedUser'! מסדי נתונים שזוהו: " . ($mysqlDbFound ?: 'יש לשייך מסד נתונים למשתמש') . " ✅"
        : "נכשל: " . ($mysqlError ?: 'לא הצליח להתחבר. ודא שמשתמש וסיסמה נוצרו ב-MySQL Database Wizard ב-cPanel.')
];

// 4. MySQL Write / Read Test
$mysqlWriteOk = false;
$mysqlWriteErr = null;
if ($mysqlConnected && $mysqlDbFound) {
    try {
        $firstDb = explode(',', $mysqlDbFound)[0];
        $firstDb = trim($firstDb);
        $pdo->exec("USE `$firstDb`");
        $pdo->exec("CREATE TABLE IF NOT EXISTS _diag_test (id INT AUTO_INCREMENT PRIMARY KEY, txt VARCHAR(50), d DATETIME);");
        $pdo->exec("INSERT INTO _diag_test (txt, d) VALUES ('test_ok', NOW());");
        $cnt = $pdo->query("SELECT count(*) FROM _diag_test")->fetchColumn();
        $pdo->exec("DROP TABLE _diag_test;");
        $mysqlWriteOk = true;
    } catch (Exception $e) {
        $mysqlWriteErr = $e->getMessage();
    }
}

$results[] = [
    'title' => 'בדיקת כתיבה וקריאה מעשית ב-MySQL',
    'status' => $mysqlWriteOk ? 'ok' : ($mysqlConnected ? 'warning' : 'error'),
    'detail' => $mysqlWriteOk
        ? 'הצלחה מלאה! כתיבה, יצירת טבלאות וקריאה ב-MySQL עובדות ללא שום שגיאה! 🎉'
        : ($mysqlWriteErr ? 'שגיאת כתיבה: ' . $mysqlWriteErr : 'טרם נבדק (ממתין לזיהוי מסד)')
];
?>
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>בדיקת שרת — Gemini Share Hub</title>
    <style>
        body {
            background: #0A1122;
            color: #E2E8F0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 2rem;
            display: flex;
            justify-content: center;
        }
        .container {
            max-width: 720px;
            width: 100%;
            background: #14203A;
            border: 1px solid rgba(212, 175, 55, 0.3);
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        h1 {
            color: #D4AF37;
            margin-top: 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .item {
            background: rgba(10, 17, 34, 0.7);
            border: 1px solid rgba(176, 196, 222, 0.15);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 0.75rem;
        }
        .item.ok { border-right: 4px solid #10B981; }
        .item.error { border-right: 4px solid #EF4444; }
        .item.warning { border-right: 4px solid #F59E0B; }
        .title {
            font-weight: bold;
            font-size: 1.05rem;
            margin-bottom: 0.25rem;
            display: flex;
            justify-content: space-between;
        }
        .detail {
            color: #94A3B8;
            font-size: 0.9rem;
            word-break: break-word;
        }
        .badge {
            font-size: 0.8rem;
            padding: 0.2rem 0.6rem;
            border-radius: 9999px;
            font-weight: 600;
        }
        .badge.ok { background: rgba(16, 185, 129, 0.2); color: #10B981; }
        .badge.error { background: rgba(239, 68, 68, 0.2); color: #EF4444; }
        .badge.warning { background: rgba(245, 158, 11, 0.2); color: #F59E0B; }
        .summary {
            margin-top: 1.5rem;
            padding: 1rem;
            border-radius: 8px;
            text-align: center;
            font-size: 1.1rem;
            font-weight: bold;
            background: <?php echo $mysqlWriteOk ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'; ?>;
            color: <?php echo $mysqlWriteOk ? '#10B981' : '#EF4444'; ?>;
            border: 1px solid <?php echo $mysqlWriteOk ? '#10B981' : '#EF4444'; ?>;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 בדיקת תקינות שרת ומסד נתונים</h1>
        <p style="color: #94A3B8;">דף זה מריץ בדיקה של חיבור MySQL והרשאות בשרת cPanel.</p>
        
        <?php foreach ($results as $r): ?>
            <div class="item <?php echo $r['status']; ?>">
                <div class="title">
                    <span><?php echo htmlspecialchars($r['title']); ?></span>
                    <span class="badge <?php echo $r['status']; ?>">
                        <?php echo $r['status'] === 'ok' ? 'תקין ✅' : ($r['status'] === 'error' ? 'שגיאה ❌' : 'שים לב ⚠️'); ?>
                    </span>
                </div>
                <div class="detail"><?php echo htmlspecialchars($r['detail']); ?></div>
            </div>
        <?php endforeach; ?>

        <div class="summary">
            <?php if ($mysqlWriteOk): ?>
                🎉 השרת מחובר ל-MySQL ב-100%! כתיבה וקריאה למסד הנתונים פועלות בצורה מושלמת.
            <?php elseif ($mysqlConnected): ?>
                ⚠️ המשתמש התחבר בהצלחה, אך לא נמצא מסד נתונים. ודא שב-cPanel חיברת את המשתמש למסד עם ALL PRIVILEGES.
            <?php else: ?>
                ⚠️ ישנה שגיאת התחברות ל-MySQL. בדוק את הסיסמה והמשתמש שנוצרו ב-cPanel.
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
