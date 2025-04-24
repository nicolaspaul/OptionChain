const express = require('express');
const axios = require('axios');
const app = express();

// Add proper headers to your own API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/api/nse-data', async (req, res) => {
  try {
    const response = await axios.get('https://www.nseindia.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch NSE data' });
  }
});

app.listen(process.env.PORT || 3000);
