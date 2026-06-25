const path = require('path');
const { randomUUID } = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'replace-this-with-a-secure-random-secret';

if (JWT_SECRET === 'replace-this-with-a-secure-random-secret') {
  console.warn('WARNING: Using default JWT secret. Set JWT_SECRET for production deployments.');
}

app.use(express.json());

const dbPath = path.join(__dirname, 'construction.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('contractor', 'crew', 'manager')),
    company TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(role, email)
  );
`);

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      company: user.company
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  const role = String(req.body.role || '').trim();
  const company = String(req.body.company || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!['contractor', 'crew', 'manager'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  if (!company) {
    return res.status(400).json({ message: 'Company is required' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email is required' });
  }
  if (password.length < 12) {
    return res.status(400).json({ message: 'Password must be at least 12 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE role = ? AND email = ?').get(role, email);
  if (existing) {
    return res.status(409).json({ message: 'Account already exists for this role and email' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: randomUUID(),
    role,
    company,
    email,
    password_hash: passwordHash,
    created_at: Date.now()
  };

  db.prepare(
    'INSERT INTO users (id, role, company, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(user.id, user.role, user.company, user.email, user.password_hash, user.created_at);

  const token = createToken(user);
  return res.status(201).json({
    token,
    user: {
      id: user.id,
      role: user.role,
      company: user.company,
      email: user.email
    }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const role = String(req.body.role || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!['contractor', 'crew', 'manager'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = db
    .prepare('SELECT id, role, company, email, password_hash FROM users WHERE role = ? AND email = ?')
    .get(role, email);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = createToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      company: user.company,
      email: user.email
    }
  });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, role, company, email FROM users WHERE id = ?').get(req.auth.sub);
  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }
  return res.json({ user });
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
