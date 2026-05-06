require('dotenv').config();

const required = ['CALDAV_BASEURL', 'CALDAV_USERNAME', 'CALDAV_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const username = process.env.CALDAV_USERNAME;
const baseUrl = process.env.CALDAV_BASEURL.replace('%u', username).replace(/\/$/, '');

module.exports = {
  caldav: {
    baseUrl,
    username,
    password: process.env.CALDAV_PASSWORD,
    tasksUrl: process.env.CALDAV_TASKS_URL || null,
  },
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    siteTitle: process.env.SITE_TITLE || 'Nodecal',
    defaultView: process.env.DEFAULT_VIEW || 'day',
    timezone: process.env.TIMEZONE || 'UTC',
    timeFormat: process.env.TIME_FORMAT || '24h',
    weekStart: process.env.WEEK_START || 'monday',
    appPassword: process.env.APP_PASSWORD || null,
    debugSync: process.env.DEBUG_SYNC === 'true',
  },
};
