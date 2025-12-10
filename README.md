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
