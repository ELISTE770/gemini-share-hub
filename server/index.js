const express = require('express');
const cors = require('cors');
const path = require('node:path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// קבצים סטטיים (ממשק האתר)
app.use(express.static(path.join(__dirname, '..', 'public')));

// מנגנון אנטי-ספאם קל (Rate limiting לפי IP בזיכרון)
const ipPostTimestamps = new Map();

function antiSpamMiddleware(req, res, next) {
  // 1. Honeypot check: אם השדה הנסתר 'website' מלא, כנראה מדובר בבוט
  if (req.body && req.body.website) {
    return res.status(400).json({ error: 'בקשה נדחתה (זוהתה פעילות אוטומטית)' });
  }

  // 2. הגבלת קצב: מודעה אחת כל 10 שניות מאותו ה-IP (לא מופעל במצב בדיקות או פניות מקומיות)
  if (process.env.NODE_ENV !== 'test') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp.includes('127.0.0.1')) {
      return next();
    }
    const now = Date.now();
    const lastPost = ipPostTimestamps.get(clientIp);

    if (lastPost && now - lastPost < 10000) {
      return res.status(429).json({ error: 'אנא המתן מספר שניות בין פרסום מודעות' });
    }

    ipPostTimestamps.set(clientIp, now);
  }
  next();
}

/**
 * API: קבלת רשימת מודעות אישיות
 * Query params: type (offer/request), cost_type (free/paid), search (string)
 */
app.get('/api/posts', (req, res) => {
  try {
    const posts = db.getPosts({
      type: req.query.type,
      cost_type: req.query.cost_type,
      search: req.query.search
    });
    res.json({ success: true, posts });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ success: false, error: 'שגיאה בשליפת המודעות' });
  }
});

/**
 * API: פרסום מודעה אישית חדשה
 */
app.post('/api/posts', antiSpamMiddleware, (req, res) => {
  try {
    const post = db.createPost(req.body);
    res.status(201).json({ success: true, post });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * API: מחיקת מודעה עם PIN
 */
app.post('/api/posts/:id/delete', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד סודי (PIN)' });
    }

    const result = db.deletePost(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ success: false, error: 'שגיאה במחיקת המודעה' });
  }
});

/**
 * API: סימון מודעה כנסגרה
 */
app.post('/api/posts/:id/close', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד סודי (PIN)' });
    }

    const result = db.closePost(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error closing post:', error);
    res.status(500).json({ success: false, error: 'שגיאה בסגירת המודעה' });
  }
});

/**
 * API: סטטיסטיקות
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'שגיאה בקבלת נתונים' });
  }
});

/**
 * API: קבלת רשימת קבוצות שיתוף
 */
app.get('/api/groups', (req, res) => {
  try {
    const groups = db.getGroups({
      status: req.query.status,
      has_discount: req.query.has_discount,
      search: req.query.search
    });
    res.json({ success: true, groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ success: false, error: 'שגיאה בשליפת הקבוצות' });
  }
});

/**
 * API: קבלת פרטי קבוצה בודדת (ציבורי)
 */
app.get('/api/groups/:id', (req, res) => {
  try {
    const group = db.getGroupById(req.params.id, false);
    if (!group) {
      return res.status(404).json({ success: false, error: 'הקבוצה לא נמצאה' });
    }
    res.json({ success: true, group });
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ success: false, error: 'שגיאה בשליפת פרטי הקבוצה' });
  }
});

/**
 * API: פתיחת קבוצה חדשה
 */
app.post('/api/groups', antiSpamMiddleware, (req, res) => {
  try {
    const group = db.createGroup(req.body);
    res.status(201).json({ success: true, group });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * API: הצטרפות לקבוצה
 */
app.post('/api/groups/:id/join', antiSpamMiddleware, (req, res) => {
  try {
    const result = db.joinGroup(req.params.id, req.body);
    res.json({ success: true, group: result.group, isPending: result.isPending, message: result.message });
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * API: פאנל ניהול קבוצה למנהל (חשיפת כל החברים וממתינים לאישור)
 */
app.post('/api/groups/:id/admin', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    const result = db.getGroupAdminDetails(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 401).json({ success: false, error: result.message });
    }
    res.json({ success: true, group: result.group });
  } catch (error) {
    console.error('Error fetching admin group details:', error);
    res.status(500).json({ success: false, error: 'שגיאה בשליפת פרטי הניהול' });
  }
});

/**
 * API: אישור חבר ממתין ע"י המנהל
 */
app.post('/api/groups/:id/members/:memberId/approve', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    const result = db.approveGroupMember(req.params.id, req.params.memberId, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error approving member:', error);
    res.status(500).json({ success: false, error: 'שגיאה באישור המשתתף' });
  }
});

/**
 * API: הסרת חבר מהקבוצה ע"י המנהל
 */
app.post('/api/groups/:id/remove-member', (req, res) => {
  try {
    const { pin, member_id } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    if (!member_id) {
      return res.status(400).json({ success: false, error: 'נא לציין מזהה משתתף' });
    }
    const result = db.removeGroupMember(req.params.id, member_id, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ success: false, error: 'שגיאה בהסרת המשתתף' });
  }
});

/**
 * API: סגירת קבוצה עם PIN
 */
app.post('/api/groups/:id/close', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    const result = db.closeGroup(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error closing group:', error);
    res.status(500).json({ success: false, error: 'שגיאה בסגירת הקבוצה' });
  }
});

/**
 * API: פתיחה מחדש של קבוצה עם PIN
 */
app.post('/api/groups/:id/reopen', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    const result = db.reopenGroup(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message, status: result.status });
  } catch (error) {
    console.error('Error reopening group:', error);
    res.status(500).json({ success: false, error: 'שגיאה בפתיחת הקבוצה מחדש' });
  }
});

/**
 * API: מחיקת קבוצה עם PIN
 */
app.post('/api/groups/:id/delete', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    const result = db.deleteGroup(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ success: false, error: 'שגיאה במחיקת הקבוצה' });
  }
});

/**
 * API: אימות קוד PIN של מנהל הקבוצה
 */
app.post('/api/groups/:id/verify-pin', (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'נא להזין קוד ניהול (PIN)' });
    }
    const result = db.verifyGroupPin(req.params.id, pin);
    if (!result.success) {
      return res.status(result.status || 401).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: 'קוד אומת בהצלחה' });
  } catch (error) {
    console.error('Error verifying pin:', error);
    res.status(500).json({ success: false, error: 'שגיאה באימות הקוד' });
  }
});

// מסלולים ייעודיים: /teamwork-preview ו-/boost
app.get(['/teamwork-preview', '/boost'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// מסלול ברירת מחדל לכל דף שאינו API - מחזיר את ה-index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// הפעלת השרת רק אם מופעל ישירות (לא בעת ייבוא לטסטים)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Gemini Share Hub פועל בהצלחה בכתובת http://localhost:${PORT}`);
  });
}

module.exports = app;
