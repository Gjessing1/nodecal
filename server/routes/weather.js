const { Router } = require('express');
const https = require('https');

const router = Router();

// In-memory cache: key = "lat,lon", value = { data, expiresAt }
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Full met.no symbol code → emoji mapping (no thermometer fallback)
const SYMBOL_EMOJI = {
  clearsky:                    '☀️',
  fair:                        '🌤️',
  partlycloudy:                '⛅',
  cloudy:                      '☁️',
  fog:                         '🌫️',
  // Rain
  lightrain:                   '🌦️',
  rain:                        '🌧️',
  heavyrain:                   '🌧️',
  lightrainshowers:            '🌦️',
  rainshowers:                 '🌧️',
  heavyrainshowers:            '🌧️',
  // Snow
  lightsnow:                   '🌨️',
  snow:                        '❄️',
  heavysnow:                   '❄️',
  lightsnowshowers:            '🌨️',
  snowshowers:                 '🌨️',
  heavysnowshowers:            '❄️',
  // Sleet (mix of rain and snow)
  lightsleet:                  '🌧️',
  sleet:                       '🌧️',
  heavysleet:                  '🌧️',
  lightsleetshowers:           '🌧️',
  sleetshowers:                '🌧️',
  heavysleetshowers:           '🌧️',
  // Thunder
  thunder:                     '⛈️',
  lightrainandthunder:         '⛈️',
  rainandthunder:              '⛈️',
  heavyrainandthunder:         '⛈️',
  lightrainshowersandthunder:  '⛈️',
  rainshowersandthunder:       '⛈️',
  heavyrainshowersandthunder:  '⛈️',
  lightsnowandthunder:         '⛈️',
  snowandthunder:              '⛈️',
  lightsleetandthunder:        '⛈️',
  sleetandthunder:             '⛈️',
};

function symbolToEmoji(code) {
  if (!code) return '';
  const base = code.replace(/_day$|_night$|_polartwilight$/, '').toLowerCase();
  // Return matched emoji or fall back to cloudy (safe default)
  return SYMBOL_EMOJI[base] || '☁️';
}

function fetchFromMet(lat, lon) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.met.no',
      path: `/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
      headers: { 'User-Agent': 'Nodecal/1.0 github.com/Gjessing1/nodecal' },
    };
    https.get(opts, res => {
      if (res.statusCode !== 200) { reject(new Error(`met.no: ${res.statusCode}`)); return; }
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/**
 * Parse met.no timeseries into { current, daily }.
 * current: { temp, symbol, emoji }
 * daily: Map of YYYY-MM-DD → { tempMin, tempMax, symbol, emoji }
 */
function parseWeather(json) {
  const series = json.properties?.timeseries || [];
  const now = new Date();

  // current: nearest timeslot to now
  const current = (() => {
    const slot = series.find(s => new Date(s.time) >= now) || series[0];
    if (!slot) return null;
    const temp = Math.round(slot.data.instant.details.air_temperature);
    const symbol = slot.data.next_1_hours?.summary?.symbol_code
                || slot.data.next_6_hours?.summary?.symbol_code || '';
    return { temp, symbol, emoji: symbolToEmoji(symbol) };
  })();

  // daily: one entry per calendar date (UTC date from timeseries)
  const dailyMap = {};
  for (const slot of series) {
    const dateStr = slot.time.slice(0, 10);
    const hour = parseInt(slot.time.slice(11, 13));
    const temp = slot.data.instant.details.air_temperature;
    const symbol6 = slot.data.next_6_hours?.summary?.symbol_code;
    const symbol1 = slot.data.next_1_hours?.summary?.symbol_code;

    if (!dailyMap[dateStr]) dailyMap[dateStr] = { temps: [], symbols: [] };
    dailyMap[dateStr].temps.push(temp);
    const sym = symbol6 || symbol1;
    if (sym && hour >= 9 && hour <= 15) dailyMap[dateStr].symbols.push(sym); // daytime symbol preference
    else if (sym) dailyMap[dateStr].symbols.push(sym);
  }

  const daily = {};
  for (const [date, d] of Object.entries(dailyMap)) {
    if (!d.temps.length) continue;
    const tempMax = Math.round(Math.max(...d.temps));
    const tempMin = Math.round(Math.min(...d.temps));
    const symbol = d.symbols[Math.floor(d.symbols.length / 2)] || ''; // mid-day symbol
    daily[date] = { tempMin, tempMax, symbol, emoji: symbolToEmoji(symbol) };
  }

  return { current, daily };
}

router.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  const latN = parseFloat(lat);
  const lonN = parseFloat(lon);
  if (isNaN(latN) || isNaN(lonN)) return res.status(400).json({ error: 'invalid coordinates' });

  const key = `${latN.toFixed(2)},${lonN.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  try {
    const raw = await fetchFromMet(latN.toFixed(4), lonN.toFixed(4));
    const data = parseWeather(raw);
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    res.json(data);
  } catch (err) {
    console.error('Weather fetch failed:', err.message);
    // Return stale cache if available
    if (cached) return res.json(cached.data);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
