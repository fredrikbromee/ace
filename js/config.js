const CONFIG = {
    files: {
        transactions: 'transactions.csv',
        benchmark: 'data/^OMX.csv',
        stockDataDir: 'data/stocks/'
    },
    requiredColumns: {
        transactions: ['Date', 'Action', 'Stock', 'Quantity', 'Price', 'Total_Value'],
        benchmark: ['Date', 'Close']
    },
    stockFileMapping: {
        'ABB': 'ABB.ST.csv',
        'Alfa Laval': 'ALFA.ST.csv',
        'Boliden': 'BOL.ST.csv',
        'Electrolux B': 'ELUX-B.ST.csv',
        'Ericsson B': 'ERIC-B.ST.csv',
        'Evolution': 'EVO.ST.csv',
        'Handelsbanken A': 'SHB-A.ST.csv',
        'Hexagon B': 'HEXA-B.ST.csv',
        'Investor B': 'INVE-B.ST.csv',
        'Kinnevik B': 'KINV-B.ST.csv',
        'Nordea Bank': 'NDA-SE.ST.csv',
        'SAAB B': 'SAAB-B.ST.csv',
        'Sandvik': 'SAND.ST.csv',
        'SEB A': 'SEB-A.ST.csv',
        'SKF B': 'SKF-B.ST.csv',
        'Swedbank A': 'SWED-A.ST.csv',
        'Tele2 B': 'TEL2-B.ST.csv',
        'Volvo B': 'VOLV-B.ST.csv'
    }
};

