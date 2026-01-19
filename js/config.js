const CONFIG = {
    files: {
        transactions: 'transactions.csv',
        benchmark: 'data/^OMX.csv'
    },
    requiredColumns: {
        transactions: ['Date', 'Action', 'Stock', 'Quantity', 'Price', 'Total_Value'],
        benchmark: ['Date', 'Close']
    }
};

