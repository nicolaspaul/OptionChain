const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

//extra code, may need at some point - 22 April
// app.get('/api/fetch-nse', async (req, res) => {
//   const response = await axios.get('https://www.nseindia.com/option-chain', {
//     headers: {
//       'User-Agent': 'Mozilla/5.0',  // okay to set in backend
//       'Accept': 'application/json'
//     }
//   });
//   res.send(response.data);
// });


function selectOptionType(strikePrice, marketPrice) {
    return strikePrice < marketPrice ? "Call" : "Put";
}

// app.get('/', (req, res) => {
//   res.send('Welcome to OptionChain API');
// });

app.get('/api/option-chain', async (req, res) => {
    const { symbol, expiry } = req.query;

    if (!symbol || !expiry) {
        return res.status(400).json({ error: 'Symbol and expiry date are required.' });
    }

    try {
        const response = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.nseindia.com/',
                'Accept': 'application/json'
            }
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
                OI: item.CE ? item.CE.openInterest : 0
            },
            put: {
                LTP: item.PE ? item.PE.lastPrice : 0,
                OI: item.PE ? item.PE.openInterest : 0
            }
        }));

        res.json(response.data);
    } catch (error) {
        console.error('Backend error:', error.message);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

//         res.json(optionData);
//     // } catch (error) {
//     //     console.error('Error fetching data:', error);
//     //     res.status(500).json({ error: 'Failed to fetch data from NSE API.' });
//     // }
// //});
        

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
