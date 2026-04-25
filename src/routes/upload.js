// Upload route kept for compatibility but files now handled
// directly in questions.js via multer FormData parsing.
// This file is intentionally minimal.
const express = require('express');
const router  = express.Router();
router.get('/health', (req, res) => res.json({ ok: true }));
module.exports = router;
