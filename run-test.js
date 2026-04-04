require('dotenv').config();
const mongoose = require('mongoose');

// We must require models first
require('./server.js');
const { runDailyScrapeAndAuthenticate } = require('./ai_marketing.js');

setTimeout(async () => {
    console.log("---- 🕷️ TRIGGERING MANUAL AD-HOC SCRAPE ----");
    await runDailyScrapeAndAuthenticate();
    console.log("---- ✅ FINISHED MANUAL SCRAPE ----");
    process.exit(0);
}, 2000);
