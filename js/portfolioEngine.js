// --- Portfolio Engine ---
class PortfolioEngine {
    constructor(trades, cashflows) {
        this.trades = trades;
        this.cashflows = cashflows;
        this.history = [];
        this.currentPositions = {};
        this.purchasePrices = {}; // Latest purchase price per stock
        this.avgCost = {}; // Average cost per share for P&L
        this.cashBalance = 0;
        this.totalDeposits = 0;
    }

    process() {
        // 1. Unify Events
        let events = [];

        // Add trades
        this.trades.forEach(trade => {
            events.push({
                date: Utils.parseDate(trade.Date),
                type: 'Trade',
                action: trade.Action,
                stock: trade.Stock,
                quantity: trade.Quantity,
                price: trade.Price,
                totalValue: trade.Total_Value,
                original: trade
            });
        });

        // Add cashflows
        this.cashflows.forEach(cf => {
            // Normalize Amount: Notebook logic says "Original_Amount" logic.
            // Let's look at notebook:
            // if Type == Deposit -> Amount = Original_Amount (Positive)
            // if Type == Withdrawal -> Amount = -Original_Amount (Negative)
            // CSV has "Amount". Let's assume CSV Amount is absolute or signed?
            // Notebook: "Convert Amount: positive for deposits, negative for withdrawals"
            // But CSV snippet shows: Date, Type, Amount.
            // Notebook code: `cashflows_df['Original_Amount'] = cashflows_df['Amount']` then applies sign.
            // This implies the CSV "Amount" is likely always positive absolute value.
            // Let's assume Type 'Deposit' adds to cash, 'Withdrawal' subtracts.
            
            let amount = cf.Amount;
            if (cf.Type === 'Deposit') {
                amount = Math.abs(amount); 
            } else if (cf.Type === 'Withdrawal') {
                amount = -Math.abs(amount);
            }
            
            events.push({
                date: Utils.parseDate(cf.Date),
                type: 'Cashflow',
                action: cf.Type,
                amount: amount,
                original: cf
            });
        });

        // Sort: Date asc. If same date: Cashflow before Trade, then Buy before Sell
        events.sort((a, b) => {
            if (a.date < b.date) return -1;
            if (a.date > b.date) return 1;
            // Same date
            if (a.type === 'Cashflow' && b.type === 'Trade') return -1;
            if (a.type === 'Trade' && b.type === 'Cashflow') return 1;
            // Both are trades on same date: Buy before Sell
            if (a.type === 'Trade' && b.type === 'Trade') {
                const aQty = a.quantity || 0;
                const bQty = b.quantity || 0;
                // Positive quantity = Buy, Negative = Sell
                // Buys (positive) should come before Sells (negative)
                if (aQty > 0 && bQty < 0) return -1;
                if (aQty < 0 && bQty > 0) return 1;
            }
            return 0;
        });
        
        // Store processed events for transaction table
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

                // Update Positions & Calculate P&L for Sells
                const stock = event.stock;
                const qty = event.quantity; // Positive for buy, Negative for sell
                
                if (!this.currentPositions[stock]) this.currentPositions[stock] = 0;
                if (!this.avgCost[stock]) this.avgCost[stock] = 0;

                if (qty > 0) {
                    // BUY: Update Average Cost
                    // New Avg Cost = ((Current Qty * Current Avg) + (Buy Qty * Buy Price)) / (Current Qty + Buy Qty)
                    // Note: Buy Price here should probably include fees? Or strictly price?
                    // Typically tax P&L uses total cost basis (including fees).
                    // Trade.Total_Value is negative cost. abs(Total_Value) is what we paid.
                    const totalCost = Math.abs(event.totalValue); // Includes price * qty + fees
                    const currentQty = this.currentPositions[stock];
                    const currentTotalCost = currentQty * this.avgCost[stock];
                    
                    this.avgCost[stock] = (currentTotalCost + totalCost) / (currentQty + qty);
                    this.currentPositions[stock] += qty;
                    
                    // Update Purchase Price (only on buys) - for NAV estimation
                    this.purchasePrices[stock] = event.price;

                } else if (qty < 0) {
                    // SELL: Calculate Realized P&L
                    // P&L = Proceeds - (Sold Qty * Avg Cost)
                    // Proceeds = Total_Value (positive, net of fees)
                    // Sold Qty is negative, so use Math.abs(qty)
                    const sellQty = Math.abs(qty);
                    const proceeds = event.totalValue;
                    
                    // Calculate cost basis using average cost BEFORE updating position
                    // If avgCost is 0 or not set, we can't calculate P&L (shouldn't happen for valid sells)
                    const costBasis = sellQty * (this.avgCost[stock] || 0);
                    
                    event.realizedPnL = proceeds - costBasis;
                    
                    // Update position AFTER calculating P&L
                    this.currentPositions[stock] += qty; // Reduce position
                    
                    // Don't reset avgCost when position closes - keep it for historical reference
                    // Only reset if position becomes exactly 0
                    if (Math.abs(this.currentPositions[stock]) < 0.0001) {
                        this.currentPositions[stock] = 0;
                        // Keep avgCost for future reference if needed
                        // Only reset if we want to start fresh (but this breaks P&L tracking)
                    }
                }
            }

            // Snapshot State
            // Calculate NAV based on latest purchase prices
            let nav = 0;
            for (const [stock, qty] of Object.entries(this.currentPositions)) {
                if (qty !== 0 && this.purchasePrices[stock]) {
                    nav += qty * this.purchasePrices[stock];
                }
            }

            const portfolioValue = this.cashBalance + nav;
            const pnl = portfolioValue - this.totalDeposits;

            this.history.push({
                date: date,
                cash: this.cashBalance,
                nav: nav,
                portfolioValue: portfolioValue,
                totalDeposits: this.totalDeposits,
                pnl: pnl,
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

        // From Cashflows
        this.cashflows.forEach(cf => {
            // Original notebook logic for IRR:
            // Deposit -> Negative flow
            // Withdrawal -> Positive flow
            let amount = cf.Amount; // CSV value
            // If CSV Amount is unsigned, check Type
            if (cf.Type === 'Deposit') {
                flows.push(-Math.abs(amount));
            } else {
                flows.push(Math.abs(amount));
            }
            dates.push(Utils.parseDate(cf.Date));
        });
        
        // Add Final Value
        flows.push(endValue);
        dates.push(endDate);

        // If no cashflows, fallback to trades (as per notebook)
        // The notebook had a fallback if cashflows_df was empty. 
        // We assume cashflows might be empty here too.
        if (this.cashflows.length === 0) {
             this.trades.forEach(trade => {
                 if (trade.Quantity > 0) { // Buy
                     flows.push(-Math.abs(trade.Total_Value)); // Money out
                     dates.push(Utils.parseDate(trade.Date));
                 }
                 // Sells are internal to portfolio (cash stays), unless withdrawn.
                 // Notebook logic: "Sells are NOT cash flows because the proceeds stay in the portfolio as cash"
             });
             // Re-add final value (it was added above, but if flows was just 1 item, clean up)
             // Actually, just append to flows.
        }
        
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

