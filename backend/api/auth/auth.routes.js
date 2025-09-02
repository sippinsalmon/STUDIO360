/**
 * Minimal Auth Routes (stub)
 * Provides basic endpoints used by the frontend. Not production-ready.
 */

const express = require('express');
const router = express.Router();

// naive in-memory user
let currentUser = {
  id: 'u_1',
  name: 'Demo User',
  email: 'demo@example.com',
  role: 'admin',
};

router.get('/me', (req, res) => {
  return res.json({ success: true, data: { user: currentUser } });
});

router.post('/sign-in', express.json(), (req, res) => {
  const { email } = req.body || {};
  if (email) currentUser = { ...currentUser, email };
  return res.json({ success: true, data: { token: 'stub-token', user: currentUser } });
});

router.post('/sign-up', express.json(), (req, res) => {
  const { name, email } = req.body || {};
  currentUser = { id: 'u_1', name: name || currentUser.name, email: email || currentUser.email, role: 'admin' };
  return res.json({ success: true, data: { token: 'stub-token', user: currentUser } });
});

router.post('/logout', (req, res) => {
  return res.json({ success: true, message: 'Logged out' });
});

router.get('/profile', (req, res) => {
  return res.json({ success: true, data: { user: currentUser } });
});

module.exports = router;
