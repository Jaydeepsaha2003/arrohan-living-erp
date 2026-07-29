'use strict';

/**
 * Vercel serverless entry point.
 *
 * Vercel imports this module and calls the exported handler per request — it
 * never runs `app.listen()`. Every route below /api/* in vercel.json is routed
 * here. The Express app itself (server/app.js) already awaits `ready()` on
 * every request, which runs the one-time migration/seed check, so a cold start
 * and a warm request both work correctly.
 */

const { app } = require('../server/app');

module.exports = app;
