// --- Portfolio Engine ---
class PortfolioEngine {
    constructor(transactions) {
        this.transactions = transactions;
        this.history = [];
        this.currentPositions = {};
        this.purchasePrices = {}; // Latest purchase price per stock
        this.avgPrice = {}; // Average price per share for cost basis (without fees)
        this.realizedPnL = 0; // Track realized losses from fees separately
        this.cashBalance = 0;
        this.totalDeposits = 0;
    }

    process() {
        // File is reverse chronological (newest first), reverse it for processing (oldest first)
        const reversedTransactions = [...this.transactions].reverse();
        
        // 1. Process all transactions in chronological order (oldest first)
        let events = [];

        // Process each transaction row, identifying type based on Action column
        reversedTransactions.forEach((row, index) => {
            const action = row.Action;
            
            // Check if it's a cashflow (Deposit or Withdrawal)
            // Check Action column for "Deposit"/"Withdrawal"
            const isDeposit = action === 'Deposit';
            const isWithdrawal = action === 'Withdrawal';
            
            if (isDeposit || isWithdrawal) {
                // Parse amount from Total_Value column
                let amount = row.Total_Value || 0;
                
                const cashflowAction = isDeposit ? 'Deposit' : 'Withdrawal';
                if (isDeposit) {
                    amount = Math.abs(amount);
                } else {
                    amount = -Math.abs(amount);
                }
                
                events.push({
                    date: Utils.parseDate(row.Date),
                    type: 'Cashflow',
                    action: cashflowAction,
                    amount: amount,
                    original: row
                });
            } else {
                // It's a trade (Köp, Sälj, etc.)
                events.push({
                    date: Utils.parseDate(row.Date),
                    type: 'Trade',
                    action: row.Action,
                    stock: row.Stock,
                    quantity: row.Quantity,
                    price: row.Price,
                    totalValue: row.Total_Value,
                    original: row
                });
            }
        });

        // Store processed events for transaction table (in chronological order for processing)
        this.processedEvents = events;

        // 2. Process Events
        events.forEach(event => {
            const date = event.date;

            if (event.type === 'Cashflow') {
                this.cashBalance += event.amount;
                if (event.amount > 0) {
                    this.totalDeposits += event.amount;
                }
            } else if (event.type === 'Trade') {
                // Trade.Total_Value is:
                // Buys: Negative (cost).
                // Sells: Positive (proceeds).
                // So we always ADD Total_Value to cash.
                this.cashBalance += event.totalValue;

                // Update Positions & Calculate P&L
                const stock = event.stock;
                const qty = event.quantity; // Positive for buy, Negative for sell
                
                if (!this.currentPositions[stock]) this.currentPositions[stock] = 0;
                if (!this.avgPrice[stock]) this.avgPrice[stock] = 0;

                if (qty > 0) {
                    // BUY: Calculate fees and record as immediate realized loss
                    // Cost basis = Price * Quantity (without fees)
                    const priceValue = event.price * qty; // Price * qty (without fees)
                    const totalCost = Math.abs(event.totalValue); // Includes price * qty + fees
                    const fees = totalCost - priceValue; // Fees paid
                    
                    // Record fees as immediate realized loss
                    this.realizedPnL -= fees;
                    
                    // Update average price (without fees) for cost basis
                    const currentQty = this.currentPositions[stock];
                    const currentPriceValue = currentQty * this.avgPrice[stock];
                    this.avgPrice[stock] = (currentPriceValue + priceValue) / (currentQty + qty);
                    
                    this.currentPositions[stock] += qty;
                    
                    // Update Purchase Price (only on buys) - for display purposes
                    this.purchasePrices[stock] = event.price;

                } else if (qty < 0) {
                    // SELL: Calculate fees and price P&L separately
                    const sellQty = Math.abs(qty);
                    const proceeds = event.totalValue; // Net proceeds (after fees)
                    const priceValue = event.price * sellQty; // Gross proceeds (before fees)
                    const sellFees = priceValue - proceeds; // Fees on sell
                    
                    // Record sell fees as realized loss
                    this.realizedPnL -= sellFees;
                    
                    // Calculate realized gain/loss on price movement (cost basis is price only)
                    const costBasis = sellQty * (this.avgPrice[stock] || 0); // Cost basis (price only, no fees)
                    const pricePnL = proceeds - costBasis; // P&L from price movement
                    
                    // Store price P&L for transaction history
                    event.realizedPnL = pricePnL;
                    
                    // Update position AFTER calculating P&L
                    this.currentPositions[stock] += qty; // Reduce position
                    
                    // Reset position if exactly 0
                    if (Math.abs(this.currentPositions[stock]) < 0.0001) {
                        this.currentPositions[stock] = 0;
                    }
                }
            }

            // Snapshot State
            // Calculate NAV based on cost basis (average price without fees)
            let nav = 0;
            for (const [stock, qty] of Object.entries(this.currentPositions)) {
                if (qty !== 0 && this.avgPrice[stock]) {
                    nav += qty * this.avgPrice[stock];
                }
            }

            // Portfolio value = cash + cost basis
            // Total P&L = realized P&L (fees) + unrealized P&L (price movements)
            // For now, unrealized P&L is 0 since NAV = cost basis
            // (Would need current market prices to calculate unrealized gains/losses)
            const portfolioValue = this.cashBalance + nav;
            const totalPnL = this.realizedPnL; // Currently only realized losses (fees)
            const pnl = portfolioValue - this.totalDeposits; // This should equal totalPnL

            this.history.push({
                date: date,
                cash: this.cashBalance,
                nav: nav,
                portfolioValue: portfolioValue,
                totalDeposits: this.totalDeposits,
                pnl: pnl,
                realizedPnL: this.realizedPnL,
                positions: { ...this.currentPositions } // Shallow copy
            });
        });

        return this.history;
    }

    getStats() {
        if (this.history.length === 0) return null;

        const last = this.history[this.history.length - 1];
        const firstDate = this.history[0].date;
        const lastDate = last.date;

        // Simple Return
        let totalReturnPct = 0;
        if (this.totalDeposits > 0) {
            totalReturnPct = ((last.portfolioValue - this.totalDeposits) / this.totalDeposits) * 100;
        }

        // CAGR / XIRR
        const cagr = this.calculateCAGR(last.portfolioValue, lastDate);

        return {
            portfolioValue: last.portfolioValue,
            cash: last.cash,
            totalReturnPct: totalReturnPct,
            cagr: cagr,
            holdings: this.currentPositions,
            purchasePrices: this.purchasePrices,
            nav: last.nav
        };
    }

    calculateCAGR(endValue, endDate) {
        // XIRR Calculation
        // Cashflows: 
        // - Deposits (negative, money out)
        // - Withdrawals (positive, money in)
        // - Final Value (positive)
        
        let flows = [];
        let dates = [];

        // From transactions - extract deposits and withdrawals (in chronological order)
        const reversedTransactions = [...this.transactions].reverse();
        reversedTransactions.forEach(row => {
            const action = row.Action;
            
            // Check if it's a cashflow (Deposit or Withdrawal)
            const isDeposit = action === 'Deposit';
            const isWithdrawal = action === 'Withdrawal';
            
            if (isDeposit || isWithdrawal) {
                // Parse amount from Total_Value column
                let amount = row.Total_Value || 0;
                
                // Original notebook logic for IRR:
                // Deposit -> Negative flow (money out)
                // Withdrawal -> Positive flow (money in)
                if (isDeposit) {
                    flows.push(-Math.abs(amount));
                } else {
                    flows.push(Math.abs(amount));
                }
                dates.push(Utils.parseDate(row.Date));
            }
        });
        
        // Add Final Value
        flows.push(endValue);
        dates.push(endDate);
        
        // Solve XIRR
        // Using a simple iterative solver (Newton-Raphson or Bisection)
        // f(r) = sum(flow_i / (1+r)^t_i) = 0
        // t_i in years
        
        const minDate = dates.reduce((a, b) => a < b ? a : b);
        
        const xirrFunc = (rate) => {
            let npv = 0;
            for (let i = 0; i < flows.length; i++) {
                const days = (dates[i] - minDate) / (1000 * 60 * 60 * 24);
                const years = days / 365.25;
                npv += flows[i] / Math.pow(1 + rate, years);
            }
            return npv;
        };

        // Solver
        let rate = 0.1; // Initial guess 10%
        for (let i = 0; i < 50; i++) {
            const y = xirrFunc(rate);
            if (Math.abs(y) < 0.01) break; // Close enough

            // Derivative approx
            const delta = 0.0001;
            const y2 = xirrFunc(rate + delta);
            const dy = (y2 - y) / delta;
            
            if (dy === 0) break;
            rate = rate - y / dy;
        }
        
        // Check for unreasonable results
        if (isNaN(rate) || Math.abs(rate) > 100) return 0; // Fail safe

        return rate * 100;
    }
}

