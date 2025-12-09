# ACE

A log of trades I have done with instructions from an ai

## Quick Start 

1. Open `index.html` in your browser or use VS Code's Live Server extension
2. The dashboard will automatically load data from `trades.csv` and `cashflows.csv`

## Project Structure

```
ace/
├── index.html          # Main HTML file
├── styles.css          # Stylesheet
├── trades.csv          # Trading data
├── cashflows.csv       # Deposits and withdrawals
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

### trades.csv
Expected columns: `Date`, `Stock`, `Action`, `Quantity`, `Price`, `Total_Value`

### cashflows.csv
Expected columns: `Date`, `Type`, `Amount`, `Description`
