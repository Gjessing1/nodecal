const { Router } = require('express');
const { listTokens, createToken, revokeToken } = require('../integrations/tokens');

// Managing integration tokens sits behind the normal session gate; only using
// one (routes/glance.js) does not.
const router = Router();

router.get('/integrations/tokens', (req, res) => {
  res.json(listTokens());
});

router.post('/integrations/tokens', (req, res) => {
  res.status(201).json(createToken(req.body?.label));
});

router.delete('/integrations/tokens/:id', (req, res) => {
  if (!revokeToken(req.params.id)) return res.status(404).json({ error: 'Token not found' });
  res.status(204).end();
});

module.exports = router;
