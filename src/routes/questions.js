const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const { body, validationResult } = require('express-validator');
const Question = require('../models/Question');
const protect  = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// ── Multer — memory storage, max 5MB per file ──────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits : { fileSize: 5 * 1024 * 1024 },
}).fields([
  { name: 'solutionFile', maxCount: 1 },
  { name: 'hintFile',     maxCount: 1 },
]);

// Helper: multer file → plain object stored in Mongo
const toAttachment = (file) => ({
  name   : file.originalname,
  type   : file.mimetype,
  size   : file.size,
  data   : `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
  isImage: file.mimetype.startsWith('image/'),
});

// Middleware that runs multer then exposes req.body + req.files
const parseForm = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// ── GET /api/questions ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, limit = 200,
      difficulty, status, platform, search,
      sortBy = 'createdAt', order = 'desc',
    } = req.query;

    const filter = { user: req.user._id };
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (status     && status     !== 'all') filter.status     = status;
    if (platform   && platform   !== 'all') filter.platform   = platform;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: order === 'asc' ? 1 : -1 };

    const [questions, total] = await Promise.all([
      Question.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
      Question.countDocuments(filter),
    ]);

    res.json({ questions, pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/questions — multipart/form-data ──────────────
router.post('/', parseForm, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Question name is required' });

  try {
    const payload = {
      user      : req.user._id,
      name      : req.body.name,
      date      : req.body.date,
      difficulty: req.body.difficulty || 'easy',
      status    : req.body.status     || 'pending',
      platform  : req.body.platform   || 'LeetCode',
      codeLink  : req.body.codeLink   || '',
      notionLink: req.body.notionLink || '',
      solution  : req.body.solution   || '',
      hint      : req.body.hint       || '',
    };

    if (req.files?.solutionFile?.[0]) payload.solutionFile = toAttachment(req.files.solutionFile[0]);
    if (req.files?.hintFile?.[0])     payload.hintFile     = toAttachment(req.files.hintFile[0]);

    const question = await Question.create(payload);
    res.status(201).json({ question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/questions/export/excel ───────────────────────
// NOTE: must be defined BEFORE /:id to avoid route conflict
router.get('/export/excel', async (req, res) => {
  try {
    const questions = await Question.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();

    const data = questions.map((q, i) => ({
      '#'          : i + 1,
      'Date'       : q.date,
      'Question'   : q.name,
      'Difficulty' : q.difficulty,
      'Status'     : q.status,
      'Platform'   : q.platform,
      'Code Link'  : q.codeLink    || '',
      'Notion Link': q.notionLink  || '',
      'Solution'   : q.solution    || '',
      'Hint'       : q.hint        || '',
      'Sol File'   : q.solutionFile?.name || '',
      'Hint File'  : q.hintFile?.name    || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      {wch:4},{wch:12},{wch:40},{wch:10},{wch:10},{wch:14},
      {wch:36},{wch:36},{wch:60},{wch:40},{wch:20},{wch:20},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');

    const sumRows = [
      ['DSA Tracker Export',''],
      ['Generated', new Date().toLocaleString()],['',''],
      ['Total',         questions.length],
      ['Solved',        questions.filter(q => q.status === 'done').length],
      ['Pending',       questions.filter(q => q.status === 'pending').length],['',''],
      ['Easy solved',   questions.filter(q => q.difficulty==='easy'   && q.status==='done').length],
      ['Medium solved', questions.filter(q => q.difficulty==='medium' && q.status==='done').length],
      ['Hard solved',   questions.filter(q => q.difficulty==='hard'   && q.status==='done').length],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(sumRows);
    ws2['!cols'] = [{wch:20},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=DSA_${new Date().toISOString().slice(0,10)}.xlsx`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/questions/:id ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const question = await Question.findOne({ _id: req.params.id, user: req.user._id });
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    res.json({ question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/questions/:id — multipart/form-data ────────
router.patch('/:id', parseForm, async (req, res) => {
  try {
    const question = await Question.findOne({ _id: req.params.id, user: req.user._id });
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    // Update text fields
    const textFields = ['name','date','difficulty','status','platform','codeLink','notionLink','solution','hint'];
    textFields.forEach(k => { if (req.body[k] !== undefined) question[k] = req.body[k]; });

    // Handle file updates
    if (req.files?.solutionFile?.[0]) {
      question.solutionFile = toAttachment(req.files.solutionFile[0]);
    } else if (req.body.removeSolutionFile === 'true') {
      question.solutionFile = null;
    }

    if (req.files?.hintFile?.[0]) {
      question.hintFile = toAttachment(req.files.hintFile[0]);
    } else if (req.body.removeHintFile === 'true') {
      question.hintFile = null;
    }

    await question.save();
    res.json({ question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/questions/:id/toggle-status ────────────────
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const q = await Question.findOne({ _id: req.params.id, user: req.user._id });
    if (!q) return res.status(404).json({ error: 'Question not found.' });
    q.status = q.status === 'done' ? 'pending' : 'done';
    await q.save();
    res.json({ question: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/questions/:id ─────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const q = await Question.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!q) return res.status(404).json({ error: 'Question not found.' });
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
