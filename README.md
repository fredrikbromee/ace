# ACE

A log of trades I have done with instructions from an ai. Open at https://fredrikbromee.github.io/ace/

## Quick Start 

1. Open `index.html` in your browser or use VS Code's Live Server extension
2. The dashboard will automatically load data from `transactions.csv`

## Project Structure

```
ace/
├── index.html          # Main HTML file
├── styles.css          # Stylesheet
├── transactions.csv    # All transactions (trades, deposits, withdrawals)
├── js/
│   ├── config.js       # Configuration
│   ├── utils.js        # Utility functions
│   ├── dataService.js  # CSV data loading
│   ├── portfolioEngine.js  # Portfolio calculation engine
│   ├── dashboard.js    # Dashboard UI rendering
│   └── main.js         # Application entry point
└── README.md           # This file
```

## Features

- Portfolio value tracking over time
- Total return and CAGR calculations
- Cash balance and NAV tracking
- Transaction history visualization
- Current holdings display

## Data Format

### transactions.csv
Expected columns: `Date`, `Account`, `Action`, `Stock`, `Quantity`, `Price`, `Total_Value`

- **Trades**: Action is "Köp" (Buy) or "Sälj" (Sell), with Stock, Quantity, Price, and Total_Value filled
- **Deposits/Withdrawals**: Action is "Deposit" or "Withdrawal", with Total_Value containing the amount (Stock, Quantity, Price are empty)
- Transactions are processed in file order


Next steps:
Get current prices to get better NAV. Try:
2. Switch to Marketstack API (Recommended for Client-Side, Supports Stockholm)

Marketstack provides EOD, intraday, and historical data for 70+ global exchanges, including Stockholm (XSTO MIC code). It's REST/JSON, with free tier (1,000 requests/month, 100 symbols/day).
Sign up for a free key at marketstack.com.
Their docs include browser-compatible JS fetch examples, implying CORS is supported for client-side calls.
Example for latest EOD (use .XSTO suffix for Stockholm symbols):textfetch('http://api.marketstack.com/v1/eod/latest?access_key=YOUR_API_KEY&symbols=SAND.XSTO')
  .then(response => response.json())
  .then(data => {
    const eodPrice = data.data[0].close; // Latest close price
    console.log(eodPrice);
  })
  .catch(error => console.error(error));
For multiple stocks: &symbols=SAND.XSTO,OTHER.XSTO.
For historical handful: Use /eod?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD.
Pros: Global coverage (including Sweden), easy integration, HTTPS support. Cons: Free tier limits; upgrade for more requests (~$9.99/mo for 10,000).
Stockholm confirmed via their exchanges endpoint: /exchanges lists XSTO.