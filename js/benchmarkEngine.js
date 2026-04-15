class BenchmarkEngine {
    constructor(capitalFlows, buyEvents, benchmarkPrices) {
        this.capitalFlows = capitalFlows; // Capital injections - when new money entered portfolio
        this.buyEvents = buyEvents; // All buy events (for reference)
        this.benchmarkPrices = benchmarkPrices; // { "2025-11-21": 2699.35, ... }
        this.history = [];
        this.totalUnits = 0;
        this.totalInvested = 0;
        this.twrHistory = [];
    }

    // Get OMX price for a date, or find closest available date
    getOmxPrice(targetDate) {
        const dateStr = targetDate.toISOString().slice(0, 10);
        if (this.benchmarkPrices[dateStr]) {
            return { date: dateStr, price: this.benchmarkPrices[dateStr] };
        }
        
        // Find closest previous date
        const sortedDates = Object.keys(this.benchmarkPrices).sort();
        let closestDate = null;
        for (const d of sortedDates) {
            if (d <= dateStr) {
                closestDate = d;
            } else {
                break;
            }
        }
        
        if (closestDate) {
            return { date: closestDate, price: this.benchmarkPrices[closestDate] };
        }
        
        // Fallback to first available date
        return { date: sortedDates[0], price: this.benchmarkPrices[sortedDates[0]] };
    }

    process() {
        if (!this.capitalFlows || this.capitalFlows.length === 0) {
            return this.history;
        }

        // Buy-and-hold benchmark:
        // every time NEW external capital enters the portfolio, buy OMX30 with that amount
        const sortedBenchmarkDates = Object.keys(this.benchmarkPrices).sort();
        
        // Build capital flow map by date (negative = injection, positive = withdrawal)
        const flowsByDate = {};
        this.capitalFlows.forEach(flow => {
            const dateKey = flow.date.toISOString().slice(0, 10);
            if (!flowsByDate[dateKey]) {
                flowsByDate[dateKey] = 0;
            }
            flowsByDate[dateKey] += flow.amount; // negative = money in, positive = money out
        });

        // Find first injection date
        const firstCapitalDate = Object.keys(flowsByDate).sort()[0];

        // Track units and invested amount over time
        let cumulativeUnits = 0;
        let cumulativeInvested = 0;

        sortedBenchmarkDates.forEach(dateKey => {
            if (dateKey < firstCapitalDate) return;

            const omxPrice = this.benchmarkPrices[dateKey];

            if (flowsByDate[dateKey]) {
                const netFlow = flowsByDate[dateKey];
                if (netFlow < 0) {
                    // Capital injection — buy OMX units
                    const amount = Math.abs(netFlow);
                    const unitsBought = amount / omxPrice;
                    cumulativeUnits += unitsBought;
                    cumulativeInvested += amount;
                } else {
                    // Withdrawal — sell OMX units proportionally
                    const amount = netFlow;
                    const unitsSold = amount / omxPrice;
                    cumulativeUnits -= unitsSold;
                    cumulativeInvested -= amount;
                }
            }

            // Record history if we have units
            if (cumulativeUnits > 0) {
                const benchmarkValue = cumulativeUnits * omxPrice;
                
                this.history.push({
                    date: Utils.parseDate(dateKey),
                    benchmarkValue: benchmarkValue,
                    totalInvested: cumulativeInvested,
                    units: cumulativeUnits,
                    omxPrice: omxPrice
                });
            }
        });

        this.totalUnits = cumulativeUnits;
        this.totalInvested = cumulativeInvested;
        return this.history;
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
        const cagr = this.calculateCAGR(last.benchmarkValue, lastDate);

        return {
            benchmarkValue: last.benchmarkValue,
            benchmarkAnnualizedTWR: annualizedTWR,
            benchmarkCAGR: cagr,
            totalUnits: this.totalUnits,
            totalInvested: this.totalInvested
        };
    }

    calculateAnnualizedTWR(twrHistory, startDate, endDate) {
        if (!twrHistory || twrHistory.length === 0) return 0;

        const lastTWR = twrHistory[twrHistory.length - 1];
        const twrReturn = lastTWR.twr / 100; // Convert from % to decimal

        // Calculate time period in years
        const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
        const years = daysDiff / 365.25;

        if (years <= 0) return 0;

        // Annualize: (1 + totalReturn)^(1/years) - 1
        const annualized = (Math.pow(1 + twrReturn, 1 / years) - 1) * 100;

        return annualized;
    }

    calculateCAGR(endValue, endDate) {
        // Use external capital flows for XIRR (buy-and-hold benchmark)
        let flows = [];
        let dates = [];

        this.capitalFlows.forEach(flow => {
            flows.push(flow.amount); // already negative for outflows
            dates.push(flow.date);
        });
        
        // Final benchmark value as terminal inflow
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

    calculateTWR() {
        if (this.history.length === 0 || this.capitalFlows.length === 0) return [];

        // TWR: Chain sub-period returns between external capital injections
        const twrData = [];
        let cumulativeTWR = 1.0; // Start at 1.0 (100%)
        let benchmarkValueAtStartOfPeriod = null;
        let lastFlowDate = null;

        // Build capital flow map by date
        const flowsByDate = {};
        this.capitalFlows.forEach(flow => {
            const dateKey = flow.date.toISOString().slice(0, 10);
            if (!flowsByDate[dateKey]) {
                flowsByDate[dateKey] = 0;
            }
            flowsByDate[dateKey] += flow.amount;
        });

        // Process each day in history
        this.history.forEach(entry => {
            const date = entry.date;
            const dateStr = date.toISOString().slice(0, 10);
            const benchmarkValue = entry.benchmarkValue;

            const netFlow = flowsByDate[dateStr] || 0;

            if (netFlow !== 0) {
                // Capital flow day (injection or withdrawal)
                if (benchmarkValueAtStartOfPeriod !== null && lastFlowDate !== null) {
                    // endValue before flow: for injection subtract bought amount,
                    // for withdrawal add back sold amount
                    const endValueBeforeFlow = benchmarkValue + netFlow;
                    if (benchmarkValueAtStartOfPeriod > 0) {
                        const periodReturn = (endValueBeforeFlow - benchmarkValueAtStartOfPeriod) / benchmarkValueAtStartOfPeriod;
                        cumulativeTWR = cumulativeTWR * (1 + periodReturn);
                    }
                } else {
                    cumulativeTWR = 1.0;
                }

                benchmarkValueAtStartOfPeriod = benchmarkValue;
                lastFlowDate = date;
            } else if (benchmarkValueAtStartOfPeriod !== null) {
                // Regular day - calculate return since last injection
                const periodReturn = (benchmarkValue - benchmarkValueAtStartOfPeriod) / benchmarkValueAtStartOfPeriod;
                cumulativeTWR = cumulativeTWR * (1 + periodReturn);
                benchmarkValueAtStartOfPeriod = benchmarkValue; // Update for next day
            } else {
                // Before first injection - TWR = 0%
                cumulativeTWR = 1.0;
            }

            twrData.push({
                date: date,
                twr: (cumulativeTWR - 1) * 100 // Convert to percentage
            });
        });

        this.twrHistory = twrData;
        return twrData;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BenchmarkEngine;
}
