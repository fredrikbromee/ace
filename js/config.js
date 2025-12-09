// Configuration
const CONFIG = {
    files: {
        trades: 'trades.csv',
        cashflows: 'cashflows.csv'
    },
    requiredColumns: {
        trades: ['Date', 'Action', 'Stock', 'Quantity', 'Price', 'Total_Value'],
        cashflows: ['Date', 'Type', 'Amount']
    }
};

