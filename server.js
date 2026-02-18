const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 7525;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'V3ncobolt!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'clash-of-minds-secret-2026';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'clash.db');

// ── Ensure data directory exists ──────────────────────────────────────────────
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ── Database setup ────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    school    TEXT NOT NULL DEFAULT '',
    score     INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Store hashed admin password in DB on first run
const existingPass = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pass');
if (!existingPass) {
  const hashed = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('admin_pass', hashed);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────

// POST /api/login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pass');
  if (!row) return res.status(500).json({ error: 'Server error' });

  const valid = bcrypt.compareSync(password, row.value);
  if (!valid) return res.status(401).json({ error: 'Password salah' });

  req.session.isAdmin = true;
  res.json({ ok: true });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// GET /api/me — check session
app.get('/api/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// POST /api/change-password
app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Data tidak lengkap' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Password baru minimal 4 karakter' });

  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_pass');
  if (!bcrypt.compareSync(oldPassword, row.value)) {
    return res.status(401).json({ error: 'Password lama salah' });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(hashed, 'admin_pass');
  res.json({ ok: true });
});

// ── PARTICIPANT ROUTES ────────────────────────────────────────────────────────

// GET /api/participants — public, used by leaderboard
app.get('/api/participants', (req, res) => {
  const rows = db.prepare('SELECT id, name, school, score FROM participants ORDER BY score DESC, name ASC').all();
  res.json(rows);
});

// POST /api/participants — add single
app.post('/api/participants', requireAuth, (req, res) => {
  const { name, school, score } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
  if (!school || !school.trim()) return res.status(400).json({ error: 'Sekolah tidak boleh kosong' });

  const id = genId();
  db.prepare('INSERT INTO participants (id, name, school, score) VALUES (?, ?, ?, ?)').run(
    id, name.trim(), school.trim(), parseInt(score) || 0
  );
  const participant = db.prepare('SELECT id, name, school, score FROM participants WHERE id = ?').get(id);
  res.json(participant);
});

// PUT /api/participants/:id — update
app.put('/api/participants/:id', requireAuth, (req, res) => {
  const { name, school, score } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
  if (!school || !school.trim()) return res.status(400).json({ error: 'Sekolah tidak boleh kosong' });

  const result = db.prepare('UPDATE participants SET name = ?, school = ?, score = ? WHERE id = ?').run(
    name.trim(), school.trim(), parseInt(score) || 0, req.params.id
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Peserta tidak ditemukan' });

  const participant = db.prepare('SELECT id, name, school, score FROM participants WHERE id = ?').get(req.params.id);
  res.json(participant);
});

// PATCH /api/participants/:id/score — quick score update
app.patch('/api/participants/:id/score', requireAuth, (req, res) => {
  const { op, value } = req.body;
  const val = parseInt(value);
  if (isNaN(val) || val < 0) return res.status(400).json({ error: 'Nilai tidak valid' });

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Peserta tidak ditemukan' });

  let newScore;
  if (op === 'set') newScore = val;
  else if (op === 'add') newScore = participant.score + val;
  else if (op === 'sub') newScore = Math.max(0, participant.score - val);
  else return res.status(400).json({ error: 'Operasi tidak valid' });

  db.prepare('UPDATE participants SET score = ? WHERE id = ?').run(newScore, req.params.id);
  res.json({ id: req.params.id, score: newScore });
});

// DELETE /api/participants/:id
app.delete('/api/participants/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM participants WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Peserta tidak ditemukan' });
  res.json({ ok: true });
});

// POST /api/participants/import — bulk CSV import
app.post('/api/participants/import', requireAuth, (req, res) => {
  const { participants, mode } = req.body;
  // participants: [{ name, school }]
  if (!Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'Tidak ada data untuk diimport' });
  }

  const insertMany = db.transaction((list) => {
    if (mode === 'replace') {
      db.prepare('DELETE FROM participants').run();
    }
    const stmt = db.prepare('INSERT INTO participants (id, name, school, score) VALUES (?, ?, ?, 0)');
    for (const p of list) {
      stmt.run(genId(), p.name.trim(), p.school.trim());
    }
  });

  insertMany(participants);
  const count = db.prepare('SELECT COUNT(*) as c FROM participants').get();
  res.json({ ok: true, total: count.c, imported: participants.length });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Clash of Minds running on port ${PORT}`);
  console.log(`   Leaderboard : http://localhost:${PORT}/`);
  console.log(`   Admin Panel : http://localhost:${PORT}/admin`);
});
