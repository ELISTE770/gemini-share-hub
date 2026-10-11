<?php
/**
 * Gemini Share Hub — בדיקת שרת ומסד נתונים (Server Diagnostic Tool)
 * פתח קובץ זה בדפדפן (לדוגמה: https://yourdomain.com/check.php) לבדיקה מהירה.
 */
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');

$results = [];

// 1. PHP Version
$phpVersion = PHP_VERSION;
$results[] = [
    'title' => 'גרסת PHP',
    'status' => version_compare($phpVersion, '7.4.0', '>=') ? 'ok' : 'error',
    'detail' => "גרסה נוכחית: $phpVersion (נדרש 7.4 ומעלה)"
];

// 2. PDO Extension
$pdoLoaded = extension_loaded('pdo');
$results[] = [
    'title' => 'הרחבת PDO',
    'status' => $pdoLoaded ? 'ok' : 'error',
    'detail' => $pdoLoaded ? 'מותקנת ופעילה' : 'חסרה! יש להפעיל הרחבת pdo ב-PHP של השרת'
];

// 3. PDO SQLite Driver
$drivers = PDO::getAvailableDrivers();
$sqliteDriver = in_array('sqlite', $drivers, true);
$results[] = [
    'title' => 'דרייבר PDO SQLite (pdo_sqlite)',
    'status' => $sqliteDriver ? 'ok' : 'error',
    'detail' => $sqliteDriver 
        ? 'מותקן ופעיל (' . implode(', ', $drivers) . ')' 
        : 'חסר! ב-cPanel כנס ל-"Select PHP Version" -> לשונית Extensions -> סמן pdo_sqlite ו-sqlite3'
];

// 4. Data Directory
$dataDir = __DIR__ . '/data';
$dataDirExists = is_dir($dataDir);
$dataDirWritable = $dataDirExists && is_writable($dataDir);
$perms = $dataDirExists ? substr(sprintf('%o', fileperms($dataDir)), -4) : 'לא קיימת';

$results[] = [
    'title' => 'תיקיית data והרשאות כתיבה',
    'status' => $dataDirWritable ? 'ok' : 'error',
    'detail' => "קיימת: " . ($dataDirExists ? 'כן' : 'לא') . " | הרשאה נוכחית: $perms | הרשאת כתיבה ל-PHP: " . ($dataDirWritable ? 'יש ✅' : 'אין ❌ (יש להגדיר 0777)')
];

// 5. Database File
$dbFile = $dataDir . '/gemini_share.sqlite';
$dbFileExists = file_exists($dbFile);
$dbFileWritable = $dbFileExists && is_writable($dbFile);
$dbPerms = $dbFileExists ? substr(sprintf('%o', fileperms($dbFile)), -4) : 'לא קיים';

$results[] = [
    'title' => 'קובץ מסד הנתונים gemini_share.sqlite',
    'status' => ($dbFileExists && $dbFileWritable) ? 'ok' : ($dbFileExists ? 'warning' : 'info'),
    'detail' => "קיים: " . ($dbFileExists ? 'כן' : 'לא') . " | הרשאה: $dbPerms | הרשאת כתיבה: " . ($dbFileWritable ? 'יש ✅' : 'אין ❌ (יש להגדיר 0666 או 0777)')
];

// 6. Test DB Connection and Real Write/Read
$writeSuccess = false;
$dbError = null;
if ($sqliteDriver && ($dataDirWritable || $dbFileWritable)) {
    try {
        $db = new PDO("sqlite:" . $dbFile, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 3
        ]);
        $db->exec("PRAGMA busy_timeout = 3000;");
        $db->exec("PRAGMA journal_mode = DELETE;");

        // Try writing a test record
        $db->exec("CREATE TABLE IF NOT EXISTS _test_diag (id INTEGER PRIMARY KEY, val TEXT, created_at TEXT);");
        $db->exec("INSERT INTO _test_diag (val, created_at) VALUES ('diag_test', datetime('now'));");
        $cnt = $db->query("SELECT count(*) FROM _test_diag;")->fetchColumn();
        $db->exec("DROP TABLE _test_diag;");
        $writeSuccess = true;
    } catch (Exception $e) {
        $dbError = $e->getMessage();
    }
}

$results[] = [
    'title' => 'בדיקת כתיבה וקריאה מעשית למסד הנתונים',
    'status' => $writeSuccess ? 'ok' : 'error',
    'detail' => $writeSuccess 
        ? 'הצלחה מלאה! ה-PHP כותב וקורא ממסד הנתונים SQLite ללא שום שגיאה ✅' 
        : 'נכשל: ' . ($dbError ?? 'אין אפשרות לכתוב (בדוק הרשאות או דרייבר)')
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
            background: <?php echo $writeSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'; ?>;
            color: <?php echo $writeSuccess ? '#10B981' : '#EF4444'; ?>;
            border: 1px solid <?php echo $writeSuccess ? '#10B981' : '#EF4444'; ?>;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 בדיקת תקינות שרת ומסד נתונים</h1>
        <p style="color: #94A3B8;">דף זה מריץ בדיקה מקיפה של כל מרכיבי השרת והרשאות הכתיבה ל-SQLite.</p>
        
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
            <?php if ($writeSuccess): ?>
                🎉 השרת מוכן ב-100%! כתיבה וקריאה למסד הנתונים פועלות בצורה מושלמת.
            <?php else: ?>
                ⚠️ ישנה שגיאה שמונעת שמירה. בדוק את השורות המסומנות באדום למעלה.
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
