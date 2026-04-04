require('dotenv').config();
const mongoose = require('mongoose');
const { initCronJobs } = require('./ai_marketing.js');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
     console.log("Connected. Triggering Scraper Force Run...");
     require('./server.js');
     setTimeout(async() => {
        const aiMarketing = require('./ai_marketing.js');
        // I need to export runDailyScrapeAndAuthenticate from ai_marketing.js to run it directly
     }, 2000);
  });
