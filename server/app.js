const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version });
});

app.listen(PORT, () => {
  console.log(`Nodecal running on port ${PORT}`);
});
