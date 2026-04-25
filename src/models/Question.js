const mongoose = require('mongoose');

// File stored as base64 data-url string inside MongoDB
const attachmentSchema = new mongoose.Schema({
  name   : { type: String, required: true },
  type   : { type: String },
  size   : { type: Number },
  data   : { type: String, required: true }, // base64 data-url
  isImage: { type: Boolean, default: false },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  user: {
    type    : mongoose.Schema.Types.ObjectId,
    ref     : 'User',
    required: true,
    index   : true,
  },
  name      : { type: String, required: true, trim: true, maxlength: 200 },
  date      : { type: String, default: () => new Date().toISOString().slice(0,10), index: true },
  difficulty: { type: String, enum: ['easy','medium','hard'], default: 'easy' },
  status    : { type: String, enum: ['done','pending'], default: 'pending' },
  platform  : { type: String, enum: ['LeetCode','Codeforces','HackerRank','GeeksforGeeks','CodeChef','AtCoder','Other'], default: 'LeetCode' },
  codeLink  : { type: String, default: '' },
  notionLink: { type: String, default: '' },
  solution  : { type: String, default: '' },
  hint      : { type: String, default: '' },
  solutionFile: { type: attachmentSchema, default: null },
  hintFile    : { type: attachmentSchema, default: null },
}, { timestamps: true });

questionSchema.index({ user: 1, date: -1 });
questionSchema.index({ user: 1, difficulty: 1, status: 1 });

module.exports = mongoose.model('Question', questionSchema);
