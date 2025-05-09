// stock-microservice.js
const express = require('express');
const axios = require('axios');
const moment = require('moment');
const NodeCache = require('node-cache');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Cache configuration - short TTL to balance performance with data freshness
const stockCache = new NodeCache({ stdTTL: 30, checkperiod: 15 });
const tokenCache = new NodeCache({ stdTTL: 3500 }); // Auth token cache with longer TTL

// API base URL
const API_BASE_URL = 'http://20.244.56.144/evaluation-service';

// Your credentials - these should be stored securely in environment variables
const credentials = {
  email: "akshama.2226csit1073@kiet.edu",
  name: "akshama",
  rollNo: "2200290110010",
  accessCode: "SxVeja",
  clientID: "d9cbb699-6a27-44a5-8d59-8b1befa816da",
  clientSecret: "tVJaaaRBSeXcRXeM"
};


// Function to get authentication token
async function getAuthToken() {
  const cachedToken = tokenCache.get('auth_token');
  if (cachedToken) {
    return cachedToken;
  }
  
  try {
    const response = await axios.post(`${API_BASE_URL}/auth`, credentials);
    const token = response.data.access_token;
    
    // Cache the token
    tokenCache.set('auth_token', token);
    
    return token;
  } catch (error) {
    console.error('Error getting auth token:', error.message);
    throw new Error('Failed to authenticate with the stock exchange API');
  }
}

// Function to get stock data with caching
async function getStockData(ticker, minutes) {
  const cacheKey = `${ticker}_${minutes}`;
  const cachedData = stockCache.get(cacheKey);
  
  if (cachedData) {
    return cachedData;
  }
  
  try {
    const token = await getAuthToken();
    const endpoint = minutes 
      ? `${API_BASE_URL}/stocks/${ticker}?minutes=${minutes}`
      : `${API_BASE_URL}/stocks/${ticker}`;
    
    const response = await axios.get(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    let priceData;
    if (Array.isArray(response.data)) {
      priceData = response.data;
    } else if (response.data.stock) {
      // Handle single stock price response
      priceData = [response.data.stock];
    } else {
      throw new Error('Unexpected response format from stock API');
    }
    
    // Cache the results
    stockCache.set(cacheKey, priceData);
    
    return priceData;
  } catch (error) {
    console.error(`Error fetching stock data for ${ticker}:`, error.message);
    throw error;
  }
}

// Function to get all available stocks
async function getAllStocks() {
  const cacheKey = 'all_stocks';
  const cachedData = stockCache.get(cacheKey);
  
  if (cachedData) {
    return cachedData;
  }
  
  try {
    const token = await getAuthToken();
    const response = await axios.get(`${API_BASE_URL}/stocks`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Cache the results with a longer TTL since this data changes less frequently
    stockCache.set(cacheKey, response.data.stocks, 300);
    
    return response.data.stocks;
  } catch (error) {
    console.error('Error fetching all stocks:', error.message);
    throw error;
  }
}

// Utility function to calculate average of an array
function calculateAverage(arr) {
  if (!arr || arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return sum / arr.length;
}

// Utility function to calculate Pearson correlation coefficient
function calculateCorrelation(xValues, yValues) {
  if (xValues.length !== yValues.length || xValues.length === 0) {
    return null;
  }
  
  // Calculate means
  const xMean = calculateAverage(xValues);
  const yMean = calculateAverage(yValues);
  
  // Calculate covariance and standard deviations
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  
  for (let i = 0; i < xValues.length; i++) {
    const xDiff = xValues[i] - xMean;
    const yDiff = yValues[i] - yMean;
    covariance += xDiff * yDiff;
    xVariance += xDiff * xDiff;
    yVariance += yDiff * yDiff;
  }
  
  const xStdDev = Math.sqrt(xVariance);
  const yStdDev = Math.sqrt(yVariance);
  
  // Check for division by zero
  if (xStdDev === 0 || yStdDev === 0) {
    return null;
  }
  
  // Calculate Pearson correlation coefficient
  return covariance / (xStdDev * yStdDev);
}

// Function to interpolate price data for time alignment
function alignTimeSeriesData(series1, series2) {
  // Sort both series by timestamp
  const sortedSeries1 = [...series1].sort((a, b) => 
    new Date(a.lastUpdatedAt) - new Date(b.lastUpdatedAt));
  const sortedSeries2 = [...series2].sort((a, b) => 
    new Date(a.lastUpdatedAt) - new Date(b.lastUpdatedAt));
  
  // Find overlapping time range
  const start1 = new Date(sortedSeries1[0].lastUpdatedAt);
  const end1 = new Date(sortedSeries1[sortedSeries1.length - 1].lastUpdatedAt);
  const start2 = new Date(sortedSeries2[0].lastUpdatedAt);
  const end2 = new Date(sortedSeries2[sortedSeries2.length - 1].lastUpdatedAt);
  
  const startTime = start1 > start2 ? start1 : start2;
  const endTime = end1 < end2 ? end1 : end2;
  
  // Filter data points within overlapping range
  const filteredSeries1 = sortedSeries1.filter(item => {
    const time = new Date(item.lastUpdatedAt);
    return time >= startTime && time <= endTime;
  });
  
  const filteredSeries2 = sortedSeries2.filter(item => {
    const time = new Date(item.lastUpdatedAt);
    return time >= startTime && time <= endTime;
  });
  
  // Create aligned data arrays
  const prices1 = [];
  const prices2 = [];
  
  // Create unified timeline from both series
  const allTimestamps = [...filteredSeries1, ...filteredSeries2]
    .map(item => new Date(item.lastUpdatedAt).getTime())
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort();
  
  // Find nearest price for each timestamp for both series
  allTimestamps.forEach(timestamp => {
    const nearest1 = findNearestDataPoint(filteredSeries1, timestamp);
    const nearest2 = findNearestDataPoint(filteredSeries2, timestamp);
    
    if (nearest1 && nearest2) {
      prices1.push(nearest1.price);
      prices2.push(nearest2.price);
    }
  });
  
  return { prices1, prices2 };
}

// Helper function to find nearest data point to a timestamp
function findNearestDataPoint(series, targetTimestamp) {
  let nearest = null;
  let minTimeDiff = Infinity;
  
  for (const dataPoint of series) {
    const time = new Date(dataPoint.lastUpdatedAt).getTime();
    const timeDiff = Math.abs(time - targetTimestamp);
    
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff;
      nearest = dataPoint;
    }
  }
  
  // Only return if within a reasonable time window (e.g., 5 minutes)
  return minTimeDiff <= 5 * 60 * 1000 ? nearest : null;
}

// API ROUTES

// Average Stock Price API
app.get('/stocks/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const minutes = req.query.minutes ? parseInt(req.query.minutes) : 60; // Default to last 60 minutes
    const aggregation = req.query['aggregation-average'] !== undefined;
    
    if (!aggregation) {
      return res.status(400).json({ error: 'Missing aggregation-average parameter' });
    }
    
    const priceHistory = await getStockData(ticker, minutes);
    
    if (!priceHistory || priceHistory.length === 0) {
      return res.status(404).json({ error: 'No price data available for the specified stock and time range' });
    }
    
    // Calculate average price
    const prices = priceHistory.map(item => item.price);
    const averagePrice = calculateAverage(prices);
    
    res.json({
      averageStockPrice: averagePrice,
      priceHistory: priceHistory
    });
  } catch (error) {
    console.error('Error in average price API:', error);
    res.status(500).json({ error: 'Failed to fetch stock price data' });
  }
});

// Stock Correlation API
app.get('/stockcorrelation', async (req, res) => {
  try {
    const minutes = req.query.minutes ? parseInt(req.query.minutes) : 60; // Default to last 60 minutes
    const tickers = req.query.ticker;
    
    // Check if exactly 2 tickers are provided
    if (!Array.isArray(tickers) || tickers.length !== 2) {
      return res.status(400).json({ 
        error: 'Exactly 2 stock tickers are required for correlation calculation' 
      });
    }
    
    // Get price data for both stocks
    const [stock1Data, stock2Data] = await Promise.all([
      getStockData(tickers[0], minutes),
      getStockData(tickers[1], minutes)
    ]);
    
    if (!stock1Data || !stock1Data.length || !stock2Data || !stock2Data.length) {
      return res.status(404).json({ 
        error: 'Insufficient price data available for the specified stocks and time range' 
      });
    }
    
    // Align time series data for correlation calculation
    const { prices1, prices2 } = alignTimeSeriesData(stock1Data, stock2Data);
    
    if (prices1.length < 2 || prices2.length < 2) {
      return res.status(404).json({ 
        error: 'Insufficient overlapping data points for correlation calculation' 
      });
    }
    
    // Calculate correlation
    const correlation = calculateCorrelation(prices1, prices2);
    
    // Calculate average prices
    const avg1 = calculateAverage(prices1);
    const avg2 = calculateAverage(prices2);
    
    res.json({
      correlation: correlation !== null ? parseFloat(correlation.toFixed(4)) : null,
      stocks: {
        [tickers[0]]: {
          averagePrice: avg1,
          priceHistory: stock1Data
        },
        [tickers[1]]: {
          averagePrice: avg2,
          priceHistory: stock2Data
        }
      }
    });
  } catch (error) {
    console.error('Error in correlation API:', error);
    res.status(500).json({ error: 'Failed to calculate stock correlation' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Stock Price Aggregation Service running on port ${PORT}`);
});

module.exports = app; // Export for testing

