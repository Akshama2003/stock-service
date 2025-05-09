# Stock Price Aggregation Microservice

A high-performance HTTP microservice for stock price aggregation and correlation analysis.

## Features

- **Average Stock Price Calculation**: Calculate the average price of a stock over a specified time period
- **Stock Correlation Analysis**: Calculate the correlation between two stocks over a specified time period
- **Efficient Caching**: Minimize API calls to the stock exchange server
- **Time Series Alignment**: Sophisticated algorithm for aligning price data from different stocks
- **Error Handling**: Robust error handling for various edge cases

## API Endpoints

### Average Stock Price

```
GET /stocks/:ticker?minutes=m&aggregation-average
```

**Parameters:**
- `ticker`: Stock ticker symbol (e.g., NVDA, AAPL)
- `minutes`: Number of minutes to look back (default: 60)
- `aggregation-average`: Flag
