const { Router } = require('express');
const { parse } = require('../nlp/parser');

const router = Router();

router.post('/nlp/parse', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json(parse(text));
});

module.exports = router;
