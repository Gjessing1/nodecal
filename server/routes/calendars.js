const { Router } = require('express');
const store = require('../cache/store');

const router = Router();

router.get('/calendars', (req, res) => {
  res.json(store.getCalendars());
});

module.exports = router;
