const assert = require('assert');
const path = require('path');
const fs = require('fs');

const Utils = require(path.join(__dirname, '..', 'js/utils.js'));
global.Utils = Utils;
const PortfolioEngine = require(path.join(__dirname, '..', 'js/portfolioEngine.js'));

// Helper to parse CSV
function parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, idx) => {
            let value = values[idx] || '';
            // Remove quotes if present
            value = value.replace(/^"|"$/g, '');
            // Try to parse as number
            if (header === 'Quantity' || header === 'Price' || header === 'Total_Value') {
                row[header] = value === '' ? null : parseFloat(value);
            } else {
                row[header] = value;
            }
        });
        rows.push(row);
    }
    return rows;
}

const tests = [
    {
        name: 'Single Buy infers capital',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.totalCapitalIn, 1000, 'Should infer 1000 capital');
            assert.strictEqual(stats.cash, 0, 'Cash should be 0 after buy');
            assert.strictEqual(stats.holdings['ABC'], 10, 'Should hold 10 shares');
        }
    },
    {
        name: 'Buy then Sell generates cash',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -5, Price: 110, Total_Value: 550 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.totalCapitalIn, 1000, 'Capital should be 1000');
            assert.strictEqual(stats.cash, 550, 'Cash should be 550 from sale');
            assert.strictEqual(stats.holdings['ABC'], 5, 'Should hold 5 shares after selling 5');
        }
    },
    {
        name: 'NAV uses lastPrice not avgPrice',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -5, Price: 110, Total_Value: 550 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            // NAV uses lastPrice (110 from sell), not avgPrice (100 from buy)
            assert.strictEqual(stats.nav, 550, 'NAV should be 5 * 110 = 550 using lastPrice');
            assert.strictEqual(stats.portfolioValue, 1100, 'Portfolio = cash (550) + NAV (550) = 1100');
        }
    },
    {
        name: 'Second buy uses cash from previous sale',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 110, Total_Value: 1100 },
                { Date: '2024-01-03', Action: 'Köp', Stock: 'XYZ', Quantity: 5, Price: 100, Total_Value: -500 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            // First buy: infer 1000 capital
            // Sell: cash = 1100
            // Second buy: use cash, no new capital needed
            assert.strictEqual(stats.totalCapitalIn, 1000, 'Should only infer 1000 from first buy');
            assert.strictEqual(stats.cash, 600, 'Cash should be 1100 - 500 = 600');
        }
    },
    {
        name: 'Second buy requires more capital',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'XYZ', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            // First buy: infer 1000 capital, cash = 0
            // Second buy: infer another 1000 capital, cash = 0
            assert.strictEqual(stats.totalCapitalIn, 2000, 'Should infer 2000 total capital');
            assert.strictEqual(stats.cash, 0, 'Cash should be 0');
        }
    },
    {
        name: 'Deposits are ignored',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            // Deposit is ignored, capital is inferred from buy
            assert.strictEqual(stats.totalCapitalIn, 1000, 'Capital should be inferred from buy');
            assert.strictEqual(stats.cash, 0, 'Cash should be 0');
        }
    },
    {
        name: 'CAGR calculation with positive return',
        run: () => {
            // Use realistic time period (1 year) for CAGR calculation
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2025-01-01', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 110, Total_Value: 1100 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            // 10% return over 1 year = ~10% CAGR
            assert.ok(stats.cagr > 5 && stats.cagr < 15, `CAGR should be around 10%, got ${stats.cagr}%`);
        }
    },
    {
        name: 'Fees reduce portfolio value',
        run: () => {
            // Buy 10 shares at 100 each, but pay 1010 (10 in fees)
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1010 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.totalCapitalIn, 1010, 'Capital = amount paid');
            assert.strictEqual(stats.totalTransactionCosts, 10, 'Fees should be 10');
            // NAV = 10 * 100 = 1000 (based on lastPrice which is 100)
            assert.strictEqual(stats.nav, 1000, 'NAV should be stock value');
            assert.strictEqual(stats.portfolioValue, 1000, 'Portfolio = 0 cash + 1000 NAV');
            assert.strictEqual(stats.netProfit, -10, 'Net profit should be -10 (fees)');
        }
    },
    {
        name: 'Realized PnL on profitable trade',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 120, Total_Value: 1200 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            // Bought at 100, sold at 120, profit = 200
            assert.strictEqual(stats.cash, 1200, 'Cash = sale proceeds');
            assert.strictEqual(stats.portfolioValue, 1200, 'Portfolio = cash only');
            assert.strictEqual(stats.netProfit, 200, 'Net profit = 1200 - 1000 = 200');
        }
    },
    {
        name: 'NAV is zero when all positions sold',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 110, Total_Value: 1100 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            const lastEntry = history[history.length - 1];
            assert.strictEqual(lastEntry.nav, 0, 'NAV should be 0 after selling all');
            assert.ok(
                lastEntry.positions['ABC'] === undefined || lastEntry.positions['ABC'] === 0,
                'Position should be 0 or removed'
            );
        }
    },
    {
        name: 'Multiple transactions on same day processed together',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'XYZ', Quantity: 5, Price: 200, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            // Should only have one history entry for the day
            assert.strictEqual(history.length, 1, 'Should have 1 history entry');
            
            const entry = history[0];
            assert.strictEqual(entry.positions['ABC'], 10, 'Should have 10 ABC');
            assert.strictEqual(entry.positions['XYZ'], 5, 'Should have 5 XYZ');
        }
    },
    {
        name: 'BuyEvents tracks all purchases for benchmark',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 110, Total_Value: 1100 },
                { Date: '2024-01-03', Action: 'Köp', Stock: 'XYZ', Quantity: 5, Price: 100, Total_Value: -500 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            // Both buys should be in buyEvents
            assert.strictEqual(engine.buyEvents.length, 2, 'Should have 2 buy events');
            assert.strictEqual(engine.buyEvents[0].amount, 1000, 'First buy = 1000');
            assert.strictEqual(engine.buyEvents[1].amount, 500, 'Second buy = 500');
        }
    },
    {
        name: 'CapitalFlows tracks only new capital injections',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 110, Total_Value: 1100 },
                { Date: '2024-01-03', Action: 'Köp', Stock: 'XYZ', Quantity: 5, Price: 100, Total_Value: -500 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            // Only first buy required new capital (cash was empty)
            // Second buy used proceeds from sale (1100 cash - 500 = 600 remaining)
            assert.strictEqual(engine.capitalFlows.length, 1, 'Should have 1 capital injection');
            assert.strictEqual(engine.capitalFlows[0].amount, -1000, 'Capital flow = -1000 (outflow)');
        }
    },
    {
        name: 'Average price calculation for multiple buys',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 120, Total_Value: -1200 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            // Average price = (10*100 + 10*120) / 20 = 110
            assert.strictEqual(engine.avgPrice['ABC'], 110, 'Avg price should be 110');
            // But NAV uses lastPrice (120 from second buy)
            assert.strictEqual(engine.lastPrice['ABC'], 120, 'Last price should be 120');
        }
    },
    {
        name: 'Day-by-day NAV uses market close prices',
        run: () => {
            const transactions = [
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const stockPrices = {
                'ABC': {
                    '2024-01-02': 100,
                    '2024-01-03': 110,
                    '2024-01-04': 105,
                    '2024-01-05': 115
                }
            };
            const tradingDays = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];

            const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
            engine.process();

            assert.strictEqual(engine.history.length, 4, 'Should have 4 daily history entries');
            assert.strictEqual(engine.history[0].nav, 1000, 'Day 1 NAV = 10 * 100');
            assert.strictEqual(engine.history[1].nav, 1100, 'Day 2 NAV = 10 * 110');
            assert.strictEqual(engine.history[2].nav, 1050, 'Day 3 NAV = 10 * 105');
            assert.strictEqual(engine.history[3].nav, 1150, 'Day 4 NAV = 10 * 115');
        }
    },
    {
        name: 'History entries generated for non-transaction days',
        run: () => {
            const transactions = [
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const stockPrices = {
                'ABC': { '2024-01-02': 100, '2024-01-03': 105, '2024-01-04': 110, '2024-01-05': 108, '2024-01-08': 112 }
            };
            const tradingDays = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];

            const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
            engine.process();

            assert.strictEqual(engine.history.length, 5, 'Should have 5 history entries (1 tx day + 4 non-tx days)');
        }
    },
    {
        name: 'Missing stock price carries forward last known',
        run: () => {
            const transactions = [
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            // Day 3 missing from stockPrices
            const stockPrices = {
                'ABC': { '2024-01-02': 100, '2024-01-04': 120 }
            };
            const tradingDays = ['2024-01-02', '2024-01-03', '2024-01-04'];

            const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
            engine.process();

            assert.strictEqual(engine.history[1].nav, 1000, 'Day 2 should carry forward price 100 from day 1');
            assert.strictEqual(engine.history[2].nav, 1200, 'Day 3 should use price 120');
        }
    },
    {
        name: 'Falls back to trade-only behavior without stockPrices',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -5, Price: 110, Total_Value: 550 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(engine.history.length, 2, 'Should have 2 entries (transaction days only)');
            assert.strictEqual(stats.nav, 550, 'NAV = 5 * 110');
            assert.strictEqual(stats.portfolioValue, 1100, 'Portfolio = 550 cash + 550 NAV');
        }
    },
    {
        name: 'NAV with market prices differs from trade price',
        run: () => {
            const transactions = [
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const stockPrices = {
                'ABC': { '2024-01-02': 100, '2024-01-03': 130 }
            };
            const tradingDays = ['2024-01-02', '2024-01-03'];

            const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.nav, 1300, 'NAV should use market close (130), not trade price (100)');
            assert.strictEqual(stats.portfolioValue, 1300, 'Portfolio = 0 cash + 1300 NAV');
        }
    },
    {
        name: 'Fallback price uses point-in-time trade price, not final trade price',
        run: () => {
            // Bug: when a stock has no market data, generateDailyHistory used this.lastPrice
            // which is the FINAL trade price across ALL transactions. This caused NAV to be
            // wildly wrong on early days when the stock was later traded at very different prices.
            //
            // Scenario: Buy ABC at 100, sell at 200 later. On the buy day, NAV should use 100
            // (the only known price at that time), not 200 (the final trade price).
            const transactions = [
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-05', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 200, Total_Value: 2000 }
            ].reverse();

            // ABC has no market data — only DEF does (to trigger generateDailyHistory)
            const stockPrices = { 'DEF': { '2024-01-02': 50 } };
            const tradingDays = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];

            const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
            engine.process();

            // Day 1 (2024-01-02): bought at 100. NAV should be 10 * 100 = 1000, not 10 * 200
            assert.strictEqual(engine.history[0].nav, 1000,
                'NAV on buy day should use buy price (100), not final trade price (200)');

            // Days 2-3 (2024-01-03, 2024-01-04): carry forward price 100
            assert.strictEqual(engine.history[1].nav, 1000,
                'NAV should carry forward the buy price');

            // Day 4 (2024-01-05): all sold, NAV = 0, cash = 2000
            assert.strictEqual(engine.history[3].nav, 0, 'NAV should be 0 after selling all');
            assert.strictEqual(engine.history[3].cash, 2000, 'Cash should be sale proceeds');
        }
    },
    {
        name: 'TWR not distorted by fallback price on sell day',
        run: () => {
            // When stock has no market data and is sold, TWR should not show a massive
            // fake drop caused by using the wrong fallback price before the sell.
            const transactions = [
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-04', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 105, Total_Value: 1050 }
            ].reverse();

            const stockPrices = { 'DEF': { '2024-01-02': 50 } };
            const tradingDays = ['2024-01-02', '2024-01-03', '2024-01-04'];

            const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
            engine.process();
            const twr = engine.calculateTWR();

            // TWR should reflect the actual 5% gain, not a fake loss
            const finalTWR = twr[twr.length - 1].twr;
            assert.ok(finalTWR > 0, `TWR should be positive (5% gain), got ${finalTWR.toFixed(2)}%`);
            assert.ok(finalTWR < 10, `TWR should be around 5%, got ${finalTWR.toFixed(2)}%`);
        }
    },
    {
        name: 'CAGR bug: Multiple capital flows with loss should not return 0%',
        run: () => {
            // Minimal case that reproduces the bug: Multiple capital injections with portfolio value < total capital
            // This tests the XIRR calculation with multiple cash flows and negative return
            const transactions = [
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'XYZ', Quantity: 5, Price: 200, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            // Simulate loss: portfolio value less than capital invested
            const last = engine.history[engine.history.length - 1];
            last.portfolioValue = 1500; // Less than 2000 capital invested (25% loss)
            last.date = new Date('2024-01-10'); // 9 days later
            
            const stats = engine.getStats();

            // CAGR should calculate negative return, not 0
            assert.ok(stats.cagr !== 0, `CAGR should not be 0 when portfolio value (${stats.portfolioValue}) < capital (${stats.totalCapitalIn}), got ${stats.cagr}%`);
            assert.ok(stats.cagr < 0, `CAGR should be negative for a loss, got ${stats.cagr}%`);
        }
    }
];

function runTests() {
    console.log('Running PortfolioEngine Tests...\n');
    let passed = 0;
    let failed = 0;

    tests.forEach(test => {
        try {
            test.run();
            console.log(`✅ ${test.name}`);
            passed++;
        } catch (e) {
            console.log(`❌ ${test.name}`);
            console.log(`   ${e.message}`);
            if (e.stack) {
                console.log(`   ${e.stack.split('\n')[1]}`);
            }
            failed++;
        }
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    return failed === 0;
}

if (require.main === module) {
    const success = runTests();
    process.exit(success ? 0 : 1);
}

module.exports = { PortfolioEngine, Utils, tests, runTests };
