class PortfolioEngine {
    constructor(transactions, stockPrices, tradingDays) {
        this.transactions = transactions;
        this.stockPrices = stockPrices || {};
        this.tradingDays = tradingDays || [];
        this.history = [];
        this.currentPositions = {};
        this.purchasePrices = {};
        this.lastPrice = {}; // Track last known price for each stock (from any trade)
        this.avgPrice = {};
        this.realizedPnL = 0;
        this.cashBalance = 0;
        this.totalCapitalIn = 0;
        this.totalTransactionCosts = 0;
        this.capitalFlows = []; // Track capital injections for XIRR
        this.buyEvents = []; // Track ALL buy events for benchmark comparison
        this.twrHistory = []; // Track TWR over time
    }

    process() {
        // Phase 1: Process all transactions and build state snapshots by date
        this.processTransactions();

        // Phase 2: Generate daily history using market prices (or fall back to transaction-only)
        const hasMarketData = this.tradingDays.length > 0 && Object.keys(this.stockPrices).length > 0;
        if (hasMarketData) {
            this.generateDailyHistory();
        } else {
            this.generateTransactionDayHistory();
        }

        return this.history;
    }

    processTransactions() {
        const chronologicalTransactions = [...this.transactions].reverse();
        let events = [];

        chronologicalTransactions.forEach((row) => {
            const action = row.Action;
            if (action === 'Deposit') return;

            let eventType;
            if (action === 'Utdelning' || action === 'Utländsk källskatt') {
                eventType = 'Dividend';
            } else if (action === 'Withdrawal') {
                eventType = 'Withdrawal';
            } else {
                eventType = 'Trade';
            }

            events.push({
                date: Utils.parseDate(row.Date),
                type: eventType,
                action: row.Action,
                stock: row.Stock,
                quantity: row.Quantity,
                price: row.Price,
                totalValue: row.Total_Value,
                original: row
            });
        });

        events.sort((a, b) => a.date - b.date);
        this.processedEvents = events;

        // Group events by date
        const eventsByDate = {};
        events.forEach(event => {
            const dateKey = event.date.toISOString().slice(0, 10);
            if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
            eventsByDate[dateKey].push(event);
        });

        this.eventsByDate = eventsByDate;
        this.stateByDate = {};

        // Process events day by day
        const sortedDates = Object.keys(eventsByDate).sort();
        sortedDates.forEach(dateKey => {
            const dayEvents = eventsByDate[dateKey];
            const date = Utils.parseDate(dateKey);

            // Calculate portfolio value BEFORE processing today's events (for TWR)
            let navBefore = 0;
            for (const [stock, qty] of Object.entries(this.currentPositions)) {
                if (qty !== 0 && this.lastPrice[stock]) {
                    navBefore += qty * this.lastPrice[stock];
                }
            }
            const portfolioValueBeforeDay = this.cashBalance + navBefore;

            dayEvents.forEach(event => {
                if (event.type === 'Trade') {
                    this.processTradeEvent(event, date, portfolioValueBeforeDay);
                } else if (event.type === 'Dividend') {
                    this.processDividendEvent(event);
                } else if (event.type === 'Withdrawal') {
                    this.processWithdrawalEvent(event, portfolioValueBeforeDay);
                }
            });

            // Save state snapshot after processing this day's transactions
            this.stateByDate[dateKey] = {
                cashBalance: this.cashBalance,
                positions: { ...this.currentPositions },
                totalCapitalIn: this.totalCapitalIn,
                realizedPnL: this.realizedPnL,
                lastPrice: { ...this.lastPrice }
            };
        });
    }

    processDividendEvent(event) {
        // Utdelning (dividend) adds cash, Utländsk källskatt (withholding tax) subtracts cash
        this.cashBalance += event.totalValue;
        this.realizedPnL += event.totalValue;
    }

    processWithdrawalEvent(event, portfolioValueBeforeDay) {
        const amount = Math.abs(event.totalValue);
        this.cashBalance -= amount;
        this.totalCapitalIn -= amount;
        this.capitalFlows.push({
            date: event.date,
            amount: amount, // positive = money out (opposite of injection)
            portfolioValueBefore: portfolioValueBeforeDay
        });
    }

    processTradeEvent(event, date, portfolioValueBeforeDay) {
        const stock = event.stock;
        const qty = event.quantity;

        this.lastPrice[stock] = event.price;

        if (!this.currentPositions[stock]) this.currentPositions[stock] = 0;
        if (!this.avgPrice[stock]) this.avgPrice[stock] = 0;

        if (qty > 0) {
            const needed = Math.abs(event.totalValue);

            this.buyEvents.push({ date: event.date, amount: needed });

            if (this.cashBalance < needed) {
                const newCapital = needed - this.cashBalance;
                this.totalCapitalIn += newCapital;
                this.capitalFlows.push({
                    date: event.date,
                    amount: -newCapital,
                    portfolioValueBefore: portfolioValueBeforeDay
                });
                this.cashBalance = 0;
            } else {
                this.cashBalance -= needed;
            }

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
            const proceeds = event.totalValue;
            this.cashBalance += proceeds;

            const sellQty = Math.abs(qty);
            const priceValue = event.price * sellQty;
            const sellFees = priceValue - proceeds;

            this.totalTransactionCosts += sellFees;
            this.realizedPnL -= sellFees;

            const costBasis = sellQty * (this.avgPrice[stock] || 0);
            const pricePnL = proceeds - costBasis;

            event.realizedPnL = pricePnL;
            this.realizedPnL += pricePnL;
            this.currentPositions[stock] += qty;

            if (Math.abs(this.currentPositions[stock]) < 0.0001) {
                delete this.currentPositions[stock];
                delete this.avgPrice[stock];
            }
        }
    }

    // Fallback: original behavior when no market data is available
    generateTransactionDayHistory() {
        const sortedDates = Object.keys(this.stateByDate).sort();
        sortedDates.forEach(dateKey => {
            const state = this.stateByDate[dateKey];
            const date = Utils.parseDate(dateKey);

            let nav = 0;
            for (const [stock, qty] of Object.entries(state.positions)) {
                if (qty !== 0 && state.lastPrice[stock]) {
                    nav += qty * state.lastPrice[stock];
                }
            }

            const portfolioValue = state.cashBalance + nav;
            const pnl = portfolioValue - state.totalCapitalIn;

            this.history.push({
                date: date,
                cash: state.cashBalance,
                nav: nav,
                portfolioValue: portfolioValue,
                totalCapitalIn: state.totalCapitalIn,
                pnl: pnl,
                realizedPnL: state.realizedPnL,
                positions: { ...state.positions }
            });
        });
    }

    // Day-by-day history using market close prices
    generateDailyHistory() {
        const transactionDates = Object.keys(this.stateByDate).sort();
        if (transactionDates.length === 0) return;

        const firstTxDate = transactionDates[0];
        const lastTxDate = transactionDates[transactionDates.length - 1];

        // Use trading days in the range from first transaction to last available
        const relevantDays = this.tradingDays.filter(d => d >= firstTxDate);

        let currentState = null;
        const marketPrices = {}; // carry-forward market prices per stock
        const tradePrices = {}; // carry-forward trade prices per stock (point-in-time)

        // Build capital flow lookup for updating portfolioValueBefore
        const capitalFlowsByDate = {};
        this.capitalFlows.forEach(cf => {
            const dateStr = cf.date.toISOString().slice(0, 10);
            if (!capitalFlowsByDate[dateStr]) capitalFlowsByDate[dateStr] = [];
            capitalFlowsByDate[dateStr].push(cf);
        });

        relevantDays.forEach(dateKey => {
            // Before applying today's state, compute portfolio value using
            // previous positions/cash at TODAY's market prices. This captures
            // intra-day market movements (e.g. ex-dividend drops) that occur
            // on capital injection days, which would otherwise be lost.
            if (capitalFlowsByDate[dateKey] && currentState) {
                let navBeforeTx = 0;
                for (const [stock, qty] of Object.entries(currentState.positions)) {
                    if (qty === 0) continue;
                    const todayPrice = (this.stockPrices[stock] && this.stockPrices[stock][dateKey] != null)
                        ? this.stockPrices[stock][dateKey]
                        : marketPrices[stock] || tradePrices[stock];
                    if (todayPrice != null) {
                        navBeforeTx += qty * todayPrice;
                    }
                }
                // Include dividends received today — they are organic returns,
                // not external capital, so they belong in the closing sub-period
                let dividendsToday = 0;
                if (this.eventsByDate[dateKey]) {
                    this.eventsByDate[dateKey].forEach(event => {
                        if (event.type === 'Dividend') {
                            dividendsToday += event.totalValue;
                        }
                    });
                }
                const valueBeforeTx = currentState.cashBalance + navBeforeTx + dividendsToday;
                capitalFlowsByDate[dateKey].forEach(cf => {
                    cf.portfolioValueBefore = valueBeforeTx;
                });
            }

            // Apply transaction state snapshot if this day had transactions
            if (this.stateByDate[dateKey]) {
                currentState = this.stateByDate[dateKey];
                // Update point-in-time trade prices
                Object.assign(tradePrices, currentState.lastPrice);
            }

            if (!currentState) return; // before first transaction

            // Look up market close prices for each held stock
            for (const stock of Object.keys(currentState.positions)) {
                if (currentState.positions[stock] === 0) continue;

                if (this.stockPrices[stock] && this.stockPrices[stock][dateKey] != null) {
                    marketPrices[stock] = this.stockPrices[stock][dateKey];
                }
                // If no market price for this day, carry forward last known
                // If never seen, fall back to point-in-time trade price
                if (marketPrices[stock] == null && tradePrices[stock]) {
                    marketPrices[stock] = tradePrices[stock];
                }
            }

            // Calculate NAV using market close prices
            let nav = 0;
            for (const [stock, qty] of Object.entries(currentState.positions)) {
                if (qty !== 0 && marketPrices[stock] != null) {
                    nav += qty * marketPrices[stock];
                }
            }

            const portfolioValue = currentState.cashBalance + nav;
            const pnl = portfolioValue - currentState.totalCapitalIn;

            this.history.push({
                date: Utils.parseDate(dateKey),
                cash: currentState.cashBalance,
                nav: nav,
                portfolioValue: portfolioValue,
                totalCapitalIn: currentState.totalCapitalIn,
                pnl: pnl,
                realizedPnL: currentState.realizedPnL,
                positions: { ...currentState.positions }
            });

        });

        // Update lastPrice to use latest market prices for getStats()
        for (const [stock, price] of Object.entries(marketPrices)) {
            if (price != null) {
                this.lastPrice[stock] = price;
            }
        }
    }

    getStats() {
        if (this.history.length === 0) return null;

        const last = this.history[this.history.length - 1];
        const first = this.history[0];
        const lastDate = last.date;
        const firstDate = first.date;

        // Calculate both annualized TWR and CAGR
        const twr = this.calculateTWR();
        const annualizedTWR = this.calculateAnnualizedTWR(twr, firstDate, lastDate);
        const cagr = this.calculateCAGR(last.portfolioValue, lastDate);

        return {
            portfolioValue: last.portfolioValue,
            cash: last.cash,
            annualizedTWR: annualizedTWR,
            cagr: cagr,
            holdings: this.currentPositions,
            purchasePrices: this.purchasePrices,
            avgPrices: this.avgPrice,
            lastPrices: this.lastPrice,
            nav: last.nav,
            totalTransactionCosts: this.totalTransactionCosts,
            netProfit: last.pnl,
            totalCapitalIn: this.totalCapitalIn
        };
    }

    calculateAnnualizedTWR(twrHistory, startDate, endDate) {
        if (!twrHistory || twrHistory.length === 0) return 0;

        const lastTWR = twrHistory[twrHistory.length - 1];
        const twrReturn = lastTWR.twr / 100; // Convert from % to decimal (e.g., 11.28% -> 0.1128)

        // Calculate time period in years
        const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
        const years = daysDiff / 365.25;

        if (years <= 0) return 0;

        // Annualize: (1 + totalReturn)^(1/years) - 1
        const annualized = (Math.pow(1 + twrReturn, 1 / years) - 1) * 100;

        return annualized;
    }

    calculateCAGR(endValue, endDate) {
        // Use capital flows (actual money in/out) for XIRR
        let flows = [];
        let dates = [];

        this.capitalFlows.forEach(flow => {
            flows.push(flow.amount);
            dates.push(flow.date);
        });
        
        // Final portfolio value as terminal inflow
        flows.push(endValue);
        dates.push(endDate);
        
        if (flows.length < 2) return 0;
        
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

        // Try different initial rates for better convergence
        // Start with a guess based on simple return
        const totalOutflows = flows.slice(0, -1).reduce((sum, f) => sum + Math.abs(f), 0);
        const totalInflow = flows[flows.length - 1];
        const simpleReturn = (totalInflow - totalOutflows) / totalOutflows;
        const daysDiff = (endDate - minDate) / (1000 * 60 * 60 * 24);
        const years = daysDiff / 365.25;
        
        // Initial guess: annualized simple return
        let rate = years > 0 ? Math.pow(1 + simpleReturn, 1 / years) - 1 : 0.1;
        
        // Clamp initial rate to reasonable range
        if (rate > 10 || rate < -0.9) {
            rate = simpleReturn > 0 ? 0.1 : -0.5; // Start positive for gains, negative for losses
        }

        for (let i = 0; i < 100; i++) {
            const y = xirrFunc(rate);
            if (Math.abs(y) < 0.01) break;

            const delta = 0.0001;
            const y2 = xirrFunc(rate + delta);
            const dy = (y2 - y) / delta;
            
            if (Math.abs(dy) < 1e-10) break; // Avoid division by very small numbers
            
            const newRate = rate - y / dy;
            
            // Prevent rate from going to extreme values
            if (newRate < -0.99 || newRate > 100) {
                break;
            }
            
            rate = newRate;
        }
        
        // Allow negative rates (losses) but clamp extreme values
        if (isNaN(rate) || rate < -0.99 || rate > 100) return 0;

        return rate * 100;
    }

    calculateTWR() {
        if (this.history.length === 0 || this.capitalFlows.length === 0) return [];

        // TWR: Chain sub-period returns between capital injections
        // On capital flow days, use portfolioValueBefore (which reflects today's
        // market prices on yesterday's positions) to close the prior sub-period,
        // then sum all capital injected that day to open the next sub-period.

        // Group capital flows by date, preserving portfolioValueBefore from the first
        const flowsByDate = {};
        this.capitalFlows.forEach(cf => {
            const dateStr = cf.date.toISOString().slice(0, 10);
            if (!flowsByDate[dateStr]) {
                flowsByDate[dateStr] = { totalAmount: 0, portfolioValueBefore: cf.portfolioValueBefore };
            }
            flowsByDate[dateStr].totalAmount += Math.abs(cf.amount);
        });

        const twrData = [];
        let cumulativeTWR = 1.0;
        let portfolioValueAtStartOfPeriod = null;
        let lastFlowDate = null;

        this.history.forEach(entry => {
            const date = entry.date;
            const dateStr = date.toISOString().slice(0, 10);
            const portfolioValue = entry.portfolioValue;

            const dayFlows = flowsByDate[dateStr];

            if (dayFlows) {
                if (portfolioValueAtStartOfPeriod !== null && lastFlowDate !== null) {
                    const endValueBeforeInjection = dayFlows.portfolioValueBefore;
                    if (portfolioValueAtStartOfPeriod > 0) {
                        const periodReturn = (endValueBeforeInjection - portfolioValueAtStartOfPeriod) / portfolioValueAtStartOfPeriod;
                        cumulativeTWR = cumulativeTWR * (1 + periodReturn);
                    }
                } else {
                    cumulativeTWR = 1.0;
                }

                portfolioValueAtStartOfPeriod = portfolioValue;
                lastFlowDate = date;
            } else if (portfolioValueAtStartOfPeriod !== null) {
                const periodReturn = (portfolioValue - portfolioValueAtStartOfPeriod) / portfolioValueAtStartOfPeriod;
                cumulativeTWR = cumulativeTWR * (1 + periodReturn);
                portfolioValueAtStartOfPeriod = portfolioValue;
            } else {
                cumulativeTWR = 1.0;
            }

            twrData.push({
                date: date,
                twr: (cumulativeTWR - 1) * 100
            });
        });

        this.twrHistory = twrData;
        return twrData;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PortfolioEngine;
}
