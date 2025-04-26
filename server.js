const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Your Lambda Proxy URL (replace with your actual API Gateway URL)
const LAMBDA_PROXY_URL = 'https://8ti42907y8.execute-api.eu-north-1.amazonaws.com/lambda-proxy';

// ScraperAPI Key (from your Lambda)
const SCRAPER_API_KEY = '07b639064e37bcc7e9e84666b6a2a33e'; // Replace if needed

function selectOptionType(strikePrice, marketPrice) {
  return strikePrice < marketPrice ? "Call" : "Put";
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/option-chain', async (req, res) => {
  const { symbol, expiry } = req.query;

  if (!symbol || !expiry) {
    return res.status(400).json({ error: 'Symbol and expiry date are required.' });
  }

  try {
    // Target NSE URL to fetch
    const nseUrl = `https://www.nseindia.com/api/option-chain-indices?symbol=${asset}`;

    // Call Lambda Proxy
    const response = await axios.get(LAMBDA_PROXY_URL, {
      params: {
        url: nseUrl,
        api_key: SCRAPER_API_KEY
      },
      timeout: 10000 // 10s timeout
    });

    // Parse response from Lambda (which forwards NSE data)
    const records = response.data.records;
    if (!records || !records.data) {
      return res.status(500).json({ error: 'Invalid API response from proxy.' });
    }

    // Format expiry date to match NSE's format (dd-mmm-yyyy)
    const expiryDate = new Date(expiry).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).replace(/ /g, '-');

    // Filter data for the selected expiry
    const filteredData = records.data.filter(item => item.expiryDate === expiryDate);
    const marketPrice = records.underlyingValue;

    if (filteredData.length === 0) {
      return res.status(404).json({ error: 'No data found for the specified expiry date.' });
    }

    // Transform data for frontend
    const optionData = filteredData.map(item => ({
      strikePrice: item.strikePrice,
      marketPrice: marketPrice,
      optionType: selectOptionType(item.strikePrice, marketPrice),
      call: {
        LTP: item.CE?.lastPrice || 0,
        OI: item.CE?.openInterest || 0,
        changeOI: item.CE?.changeinOpenInterest || 0,
        pchangeOI: item.CE?.pchangeinOpenInterest || 0
      },
      put: {
        LTP: item.PE?.lastPrice || 0,
        OI: item.PE?.openInterest || 0,
        changeOI: item.PE?.changeinOpenInterest || 0,
        pchangeOI: item.PE?.pchangeinOpenInterest || 0
      }
    }));

    res.json(optionData);
  } catch (error) {
    console.error('Error fetching data via Lambda proxy:', error);
    
    if (error.response) {
      // Proxy or NSE API error
      res.status(error.response.status || 500).json({ 
        error: 'Proxy/NSE API error',
        details: error.response.data
      });
    } else if (error.request) {
      // No response from proxy
      res.status(504).json({ error: 'Proxy request timeout' });
    } else {
      // Other errors
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
