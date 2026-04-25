const express  = require('express');
const Question = require('../models/Question');
const protect  = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  try {
    const uid   = req.user._id;
    const today = new Date().toISOString().slice(0,10);

    const [total, done, todayCount, byDiff, byPlatform, recentDates] = await Promise.all([
      Question.countDocuments({ user: uid }),
      Question.countDocuments({ user: uid, status: 'done' }),
      Question.countDocuments({ user: uid, date: today }),
      Question.aggregate([
        { $match: { user: uid } },
        { $group: { _id: { diff: '$difficulty', status: '$status' }, count: { $sum: 1 } } },
      ]),
      Question.aggregate([
        { $match: { user: uid } },
        { $group: { _id: '$platform', count: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status','done'] },1,0] } } } },
        { $sort: { count: -1 } },
      ]),
      Question.aggregate([
        { $match: { user: uid, status: 'done' } },
        { $group: { _id: '$date', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    // Streak
    const doneDates = recentDates.map(d => d._id).sort().reverse();
    let streak = 0;
    const c = new Date(); c.setHours(0,0,0,0);
    for (let i = 0; i < 365; i++) {
      const s = c.toISOString().slice(0,10);
      if (doneDates.includes(s)) { streak++; c.setDate(c.getDate()-1); }
      else if (i === 0)          { c.setDate(c.getDate()-1); }
      else break;
    }

    // Reshape difficulty stats
    const diffStats = { easy:{total:0,done:0}, medium:{total:0,done:0}, hard:{total:0,done:0} };
    byDiff.forEach(({ _id:{diff,status}, count }) => {
      if (diffStats[diff]) {
        diffStats[diff].total += count;
        if (status === 'done') diffStats[diff].done += count;
      }
    });

    res.json({ total, done, pending: total-done, todayCount, streak, diffStats, byPlatform, activity: recentDates });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
