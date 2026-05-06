const { Router } = require('express');
const { parse } = require('../nlp/parser');
const config = require('../config');

const router = Router();

router.post('/nlp/parse', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json(parse(text, new Date(), config.app.timezone));
});

module.exports = router;
