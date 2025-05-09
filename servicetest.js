// tests/stock-service.test.js
const request = require('supertest');
const axios = require('axios');
const app = require('../stock-microservice');

// Mock axios
jest.mock('axios');

describe('Stock Price Aggregation Microservice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    test('should fetch and cache auth token', async () => {
      // Mock successful auth response
      axios.post.mockResolvedValueOnce({
        data: {
          token_type: 'Bearer',
          access_token: 'mock-token-123',
          expires_in: 3600
        }
      });

      // Mock stock data response that will trigger auth token fetch
      axios.get.mockResolvedValueOnce({
        data: [
          { price: 100.25, lastUpdatedAt: '2025-05-09T02:04:22.4649084652' }
        ]
      });

      // Call the API that will trigger token fetch
      await request(app).get('/stocks/NVDA?minutes=5&aggregation-average');
      
      // Check that auth endpoint was called with correct params
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/auth'),
        expect.objectContaining({
          email: expect.any(String),
          clientID: expect.any(String),
          clientSecret: expect.any(String)
        })
      );
      
      // Second call should use cached token
      axios.get.mockResolvedValueOnce({
        data: [
          { price: 100.25, lastUpdatedAt: '2025-05-09T02:04:22.4649084652' }
        ]
      });
      
      await request(app).get('/stocks/NVDA?minutes=5&aggregation-average');
      
      // Auth endpoint should still only have been called once
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
    
    test('should handle auth token failure', async () => {
      // Mock auth failure
      axios.post.mockRejectedValueOnce(new Error('Auth failed'));
      
      // Call API
      const response = await request(app).get('/stocks/NVDA?minutes=5&aggregation-average');
      
      // Should get error response
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Average Stock Price API', () => {
    test('should calculate average price correctly', async () => {
      // Mock auth success
      axios.post.mockResolvedValueOnce({
        data: {
          token_type: 'Bearer',
          access_token: 'mock-token-123',
          expires_in: 3600
        }
      });
      
      // Mock stock data
      const mockStockData = [
        { price: 100, lastUpdatedAt: '2025-05-09T02:01:00.000Z' },
        { price: 200, lastUpdatedAt: '2025-05-09T02:02:00.000Z' },
        { price: 300, lastUpdatedAt: '2025-05-09T02:03:00.000Z' }
      ];
      
      axios.get.mockResolvedValueOnce({ data: mockStockData });
      
      // Call API
      const response = await request(app)
        .get('/stocks/NVDA?minutes=10&aggregation-average');
      
      // Verify response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('averageStockPrice', 200);
      expect(response.body).toHaveProperty('priceHistory');
      expect(response.body.priceHistory).toEqual(mockStockData);
    });
    
    test('should return 404 when no price data is available', async () => {
      // Mock auth success
      axios.post.mockResolvedValueOnce({
        data: {
          token_type: 'Bearer',
          access_token: 'mock-token-123',
          expires_in: 3600
        }
      });
      
      // Mock empty stock data
      axios.get.mockResolvedValueOnce({ data: [] });
      
      // Call API
      const response = await request(app)
        .get('/stocks/NVDA?minutes=10&aggregation-average');
      
      // Verify response
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
    
    test('should handle missing aggregation parameter', async () => {
      // Call API without aggregation parameter
      const response = await request(app)
        .get('/stocks/NVDA?minutes=10');
      
      // Verify response
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Missing aggregation-average parameter');
    });
  });

  describe('Stock Correlation API', () => {
    test('should calculate correlation correctly', async () => {
      // Mock auth success
      axios.post.mockResolvedValueOnce({
        data: {
          token_type: 'Bearer',
          access_token: 'mock-token-123',
          expires_in: 3600
        }
      });
      
      // Mock stock data for NVDA
      const mockNvdaData = [
        { price: 100, lastUpdatedAt: '2025-05-09T02:01:00.000Z' },
        { price: 200, lastUpdatedAt: '2025-05-09T02:02:00.000Z' },
        { price: 300, lastUpdatedAt: '2025-05-09T02:03:00.000Z' }
      ];
      
      // Mock stock data for AAPL
      const mockAaplData = [
        { price: 300, lastUpdatedAt: '2025-05-09T02:01:00.000Z' },
        { price: 200, lastUpdatedAt: '2025-05-09T02:02:00.000Z' },
        { price: 100, lastUpdatedAt: '2025-05-09T02:03:00.000Z' }
      ];
      
      axios.get.mockResolvedValueOnce({ data: mockNvdaData })
            .mockResolvedValueOnce({ data: mockAaplData });
      
      // Call API
      const response = await request(app)
        .get('/stockcorrelation?minutes=10&ticker=NVDA&ticker=AAPL');
      
      // Verify response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('correlation', -1); // Perfect negative correlation
      expect(response.body).toHaveProperty('stocks');
      expect(response.body.stocks).toHaveProperty('NVDA');
      expect(response.body.stocks).toHaveProperty('AAPL');
      expect(response.body.stocks.NVDA).toHaveProperty('averagePrice', 200);
      expect(response.body.stocks.AAPL).toHaveProperty('averagePrice', 200);
    });
    
    test('should return error with incorrect number of tickers', async () => {
      // Call API with only one ticker
      const response = await request(app)
        .get('/stockcorrelation?minutes=10&ticker=NVDA');
      
      // Verify response
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Exactly 2 stock tickers');
    });
    
    test('should handle insufficient data for correlation', async () => {
      // Mock auth success
      axios.post.mockResolvedValueOnce({
        data: {
          token_type: 'Bearer',
          access_token: 'mock-token-123',
          expires_in: 3600
        }
      });
      
      // Mock non-overlapping stock data
      const mockNvdaData = [
        { price: 100, lastUpdatedAt: '2025-05-09T02:01:00.000Z' }
      ];
      
      const mockAaplData = [
        { price: 300, lastUpdatedAt: '2025-05-09T03:01:00.000Z' }
      ];
      
      axios.get.mockResolvedValueOnce({ data: mockNvdaData })
            .mockResolvedValueOnce({ data: mockAaplData });
      
      // Call API
      const response = await request(app)
        .get('/stockcorrelation?minutes=10&ticker=NVDA&ticker=AAPL');
      
      // Verify response
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Insufficient overlapping data points');
    });
  });

  describe('Health Check API', () => {
    test('should return UP status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'UP');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});