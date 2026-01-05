class PortfolioEngine {
    constructor(transactions) {
        this.transactions = transactions;
        this.history = [];
        this.currentPositions = {};
        this.purchasePrices = {};
        this.avgPrice = {};
        this.realizedPnL = 0;
        this.cashBalance = 0;
        this.totalDeposits = 0;
        this.totalTransactionCosts = 0;
    }

    process() {
        // Process transactions in chronological order (oldest first) to build correct state
        // The transactions array is already in reverse chronological order, so we reverse it
        const chronologicalTransactions = [...this.transactions].reverse();
        let events = [];

        chronologicalTransactions.forEach((row) => {
            const action = row.Action;
            const isDeposit = action === 'Deposit';
            const isWithdrawal = action === 'Withdrawal';
            
            if (isDeposit || isWithdrawal) {
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

        // Sort events by date to ensure chronological processing
        events.sort((a, b) => a.date - b.date);
        
        this.processedEvents = events;

        // Group events by date and process each day's events together
        // This ensures NAV is calculated after all transactions for a day are processed
        const eventsByDate = {};
        events.forEach(event => {
            const dateKey = event.date.toISOString().slice(0, 10);
            if (!eventsByDate[dateKey]) {
                eventsByDate[dateKey] = [];
            }
            eventsByDate[dateKey].push(event);
        });

        // Process events day by day in chronological order
        const sortedDates = Object.keys(eventsByDate).sort();
        sortedDates.forEach(dateKey => {
            const dayEvents = eventsByDate[dateKey];
            const date = Utils.parseDate(dateKey);

            // Process all events for this day
            dayEvents.forEach(event => {
                if (event.type === 'Cashflow') {
                    this.cashBalance += event.amount;
                    if (event.amount > 0) {
                        this.totalDeposits += event.amount;
                    }
                } else if (event.type === 'Trade') {
                    this.cashBalance += event.totalValue;

                    const stock = event.stock;
                    const qty = event.quantity;
                    
                    if (!this.currentPositions[stock]) this.currentPositions[stock] = 0;
                    if (!this.avgPrice[stock]) this.avgPrice[stock] = 0;

                    if (qty > 0) {
                        const priceValue = event.price * qty;
                        const totalCost = Math.abs(event.totalValue);
                        const fees = totalCost - priceValue;
                        
                        this.totalTransactionCosts += fees;
                        this.realizedPnL -= fees;
                        
                        const currentQty = this.currentPositions[stock];
                        const currentPriceValue = currentQty * this.avgPrice[stock];
                        this.avgPrice[stock] = (currentPriceValue + priceValue) / (currentQty + qty);
                        
                        this.currentPositions[stock] += qty;
                        this.purchasePrices[stock] = event.price;

                    } else if (qty < 0) {
                        const sellQty = Math.abs(qty);
                        const proceeds = event.totalValue;
                        const priceValue = event.price * sellQty;
                        const sellFees = priceValue - proceeds;
                        
                        this.totalTransactionCosts += sellFees;
                        this.realizedPnL -= sellFees;
                        
                        const costBasis = sellQty * (this.avgPrice[stock] || 0);
                        const pricePnL = proceeds - costBasis;
                        
                        event.realizedPnL = pricePnL;
                        this.currentPositions[stock] += qty;
                        
                        if (Math.abs(this.currentPositions[stock]) < 0.0001) {
                            // Remove position and avgPrice when position becomes 0 to avoid using stale values
                            delete this.currentPositions[stock];
                            delete this.avgPrice[stock];
                        }
                    }
                }
            });

            // Calculate NAV and portfolio value after processing all events for this day
            let nav = 0;
            for (const [stock, qty] of Object.entries(this.currentPositions)) {
                if (qty !== 0 && this.avgPrice[stock]) {
                    nav += qty * this.avgPrice[stock];
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
                realizedPnL: this.realizedPnL,
                positions: { ...this.currentPositions }
            });
        });

        return this.history;
    }

    getStats() {
        if (this.history.length === 0) return null;

        const last = this.history[this.history.length - 1];
        const lastDate = last.date;

        let totalReturnPct = 0;
        if (this.totalDeposits > 0) {
            totalReturnPct = ((last.portfolioValue - this.totalDeposits) / this.totalDeposits) * 100;
        }

        const cagr = this.calculateCAGR(last.portfolioValue, lastDate);

        return {
            portfolioValue: last.portfolioValue,
            cash: last.cash,
            totalReturnPct: totalReturnPct,
            cagr: cagr,
            holdings: this.currentPositions,
            purchasePrices: this.purchasePrices,
            nav: last.nav,
            totalTransactionCosts: this.totalTransactionCosts,
            netProfit: last.pnl
        };
    }

    calculateCAGR(endValue, endDate) {
        let flows = [];
        let dates = [];

        const reversedTransactions = [...this.transactions].reverse();
        reversedTransactions.forEach(row => {
            const action = row.Action;
            const isDeposit = action === 'Deposit';
            const isWithdrawal = action === 'Withdrawal';
            
            if (isDeposit || isWithdrawal) {
                let amount = row.Total_Value || 0;
                if (isDeposit) {
                    flows.push(-Math.abs(amount));
                } else {
                    flows.push(Math.abs(amount));
                }
                dates.push(Utils.parseDate(row.Date));
            }
        });
        
        flows.push(endValue);
        dates.push(endDate);
        
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

        let rate = 0.1;
        for (let i = 0; i < 50; i++) {
            const y = xirrFunc(rate);
            if (Math.abs(y) < 0.01) break;

            const delta = 0.0001;
            const y2 = xirrFunc(rate + delta);
            const dy = (y2 - y) / delta;
            
            if (dy === 0) break;
            rate = rate - y / dy;
        }
        
        if (isNaN(rate) || Math.abs(rate) > 100) return 0;

        return rate * 100;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PortfolioEngine;
}

