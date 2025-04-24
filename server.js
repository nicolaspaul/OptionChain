const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Configure CORS properly
app.use(cors({
  origin: 'https://optionchain-jtbl.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Middleware to parse JSON
app.use(express.json());

// Global variable to store NSE cookies
let nseCookies = null;
let cookieLastUpdated = null;

// Function to fetch/refresh NSE cookies
async function getNSECookies() {
  try {
    // Refresh cookies if they're older than 30 minutes
    if (!nseCookies || !cookieLastUpdated || (Date.now() - cookieLastUpdated > 30 * 60 * 1000)) {
      const response = await axios.get('https://www.nseindia.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      nseCookies = response.headers['set-cookie'].join('; ');
      cookieLastUpdated = Date.now();
      console.log('NSE cookies refreshed');
    }
    return nseCookies;
  } catch (error) {
    console.error('Error fetching NSE cookies:', error);
    throw new Error('Failed to get NSE cookies');
  }
}

function selectOptionType(strikePrice, marketPrice) {
    return strikePrice < marketPrice ? "Call" : "Put";
}

app.get('/api/option-chain', async (req, res) => {
    const { symbol, expiry } = req.query;

    if (!symbol || !expiry) {
        return res.status(400).json({ error: 'Symbol and expiry date are required.' });
    }

    try {
        // Get fresh cookies
        const cookies = await getNSECookies();
        
        const response = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.nseindia.com/',
                'Cookie': cookies
            },
            timeout: 10000 // 10 seconds timeout
        });

        const records = response.data.records;
        if (!records || !records.data) {
            return res.status(500).json({ error: 'Invalid API response.' });
        }

        const expiryDate = new Date(expiry).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).replace(/ /g, '-');

        const filteredData = records.data.filter(item => item.expiryDate === expiryDate);
        const marketPrice = records.underlyingValue;

        const optionData = filteredData.map(item => ({
            strikePrice: item.strikePrice,
            marketPrice: marketPrice,
            optionType: selectOptionType(item.strikePrice, marketPrice),
            call: {
                LTP: item.CE ? item.CE.lastPrice : 0,
                OI: item.CE ? item.CE.openInterest : 0,
                volume: item.CE ? item.CE.totalTradedVolume : 0
            },
            put: {
                LTP: item.PE ? item.PE.lastPrice : 0,
                OI: item.PE ? item.PE.openInterest : 0,
                volume: item.PE ? item.PE.totalTradedVolume : 0
            }
        }));

        res.json(optionData);
    } catch (error) {
        console.error('Error fetching data:', error);
        if (error.response) {
            // NSE API returned an error
            if (error.response.status === 403) {
                // Force cookie refresh on next request if we got 403
                nseCookies = null;
                return res.status(503).json({ error: 'NSE authentication expired. Please try again.' });
            }
            return res.status(error.response.status).json({ 
                error: 'NSE API error',
                details: error.response.data 
            });
        } else if (error.request) {
            // Request was made but no response
            return res.status(504).json({ error: 'No response from NSE API' });
        } else {
            // Something else went wrong
            return res.status(500).json({ error: 'Failed to fetch data from NSE API' });
        }
    }
});

// Add endpoint for India VIX to avoid direct calls from frontend
app.get('/api/india-vix', async (req, res) => {
    try {
        const cookies = await getNSECookies();
        
        const response = await axios.get('https://www.nseindia.com/api/option-chain-indices?symbol=INDIAVIX', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': cookies
            },
            timeout: 10000
        });

        const vixValue = parseFloat(response.data.records.underlyingValue);
        res.json({ vix: vixValue });
    } catch (error) {
        console.error('Error fetching India VIX:', error);
        // Fallback to Yahoo Finance if NSE fails
        try {
            const yahooResponse = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/%5EINDIAVIX', {
                timeout: 5000
            });
            const vixValue = parseFloat(yahooResponse.data.chart.result[0].meta.regularMarketPrice);
            res.json({ vix: vixValue });
        } catch (yahooError) {
            console.error('Error fetching India VIX from Yahoo:', yahooError);
            res.status(500).json({ error: 'Failed to fetch India VIX' });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
