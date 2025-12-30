const assert = require('assert');
const path = require('path');

const Utils = require(path.join(__dirname, '..', 'js/utils.js'));
global.Utils = Utils;
const PortfolioEngine = require(path.join(__dirname, '..', 'js/portfolioEngine.js'));

const tests = [
    {
        name: 'Single Deposit',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.cash, 1000, 'Cash should equal deposit amount');
            assert.strictEqual(stats.portfolioValue, 1000, 'Portfolio value should equal cash');
        }
    },
    {
        name: 'Deposit and Buy',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 50, Total_Value: -500 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.cash, 500, 'Cash should be 1000 - 500');
            assert.strictEqual(stats.portfolioValue, 1000, 'Portfolio value should be cash + stock value');
            assert.strictEqual(stats.holdings['ABC'], 10, 'Should hold 10 shares of ABC');
        }
    },
    {
        name: 'Deposit, Buy, Sell',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 50, Total_Value: -500 },
                { Date: '2024-01-03', Action: 'Sälj', Stock: 'ABC', Quantity: -5, Price: 60, Total_Value: 300 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.cash, 800, 'Cash should be 1000 - 500 + 300');
            assert.strictEqual(stats.portfolioValue, 1050, 'Portfolio value should be cash + remaining stock value');
            assert.strictEqual(stats.holdings['ABC'], 5, 'Should hold 5 shares after selling 5');
        }
    },
    {
        name: 'Withdrawal',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-05', Action: 'Withdrawal', Total_Value: -200 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();

            assert.strictEqual(stats.cash, 800, 'Cash should be 1000 - 200');
            assert.strictEqual(stats.portfolioValue, 800, 'Portfolio value should equal cash');
        }
    },
    {
        name: 'CAGR: Simple 3% return over 1 year',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            engine.history[engine.history.length - 1].portfolioValue = 1030;
            engine.history[engine.history.length - 1].date = new Date('2025-01-01');
            const stats = engine.getStats();

            assert.ok(stats.cagr !== 0, `CAGR should not be 0, got ${stats.cagr}%`);
            assert.ok(stats.cagr > 0, `CAGR should be positive, got ${stats.cagr}%`);
            assert.ok(stats.cagr >= 2.0 && stats.cagr <= 4.0, `CAGR should be around 3%, got ${stats.cagr}%`);
        }
    },
    {
        name: 'CAGR: Simple 3% return over 2 years',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            engine.history[engine.history.length - 1].portfolioValue = 1060.9;
            engine.history[engine.history.length - 1].date = new Date('2026-01-01');
            const stats = engine.getStats();

            assert.ok(stats.cagr !== 0, `CAGR should not be 0, got ${stats.cagr}%`);
            assert.ok(stats.cagr > 0, `CAGR should be positive, got ${stats.cagr}%`);
            assert.ok(stats.cagr >= 2.0 && stats.cagr <= 4.0, `CAGR should be around 3%, got ${stats.cagr}%`);
        }
    },
    {
        name: 'CAGR: Deposit and buy, then value increases 3%',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            engine.purchasePrices['ABC'] = 103;
            const last = engine.history[engine.history.length - 1];
            last.nav = 10 * 103;
            last.portfolioValue = last.cash + last.nav;
            last.date = new Date('2025-01-01');
            const stats = engine.getStats();

            assert.ok(stats.cagr !== 0, `CAGR should not be 0, got ${stats.cagr}%`);
            assert.ok(stats.cagr > 0, `CAGR should be positive, got ${stats.cagr}%`);
            assert.ok(stats.cagr >= 2.0 && stats.cagr <= 4.0, `CAGR should be around 3%, got ${stats.cagr}%`);
        }
    },
    {
        name: 'CAGR: Verify not zero when return is positive',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();
            
            if (stats.totalReturnPct > 0) {
                assert.ok(stats.cagr !== 0, `CAGR should not be 0 when return is ${stats.totalReturnPct}%, got ${stats.cagr}%`);
            }
        }
    },
    {
        name: 'Return should reflect fees immediately after deposit and buy (no sales)',
        run: () => {
            const transactions = [
                { Date: '2025-11-25', Action: 'Deposit', Total_Value: 1893.94 },
                { Date: '2025-11-25', Action: 'Köp', Stock: 'Ericsson B', Quantity: 11, Price: 90.10, Total_Value: -992.59 },
                { Date: '2025-11-25', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 450.00, Total_Value: -901.35 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();
            
            const ericssonFees = 992.59 - (90.10 * 11);
            const saabFees = 901.35 - (450.00 * 2);
            const totalFees = ericssonFees + saabFees;
            const expectedReturn = -(totalFees / 1893.94) * 100;
            
            assert.ok(Math.abs(stats.totalReturnPct - expectedReturn) < 0.05, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${totalFees.toFixed(2)} in fees), got ${stats.totalReturnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Return should reflect fees with multiple buys of same stock',
        run: () => {
            const transactions = [
                { Date: '2025-11-24', Action: 'Deposit', Total_Value: 932.40 },
                { Date: '2025-11-24', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 465.50, Total_Value: -932.40 },
                { Date: '2025-11-25', Action: 'Deposit', Total_Value: 901.35 },
                { Date: '2025-11-25', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 450.00, Total_Value: -901.35 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();
            
            const firstBuyFees = 932.40 - (465.50 * 2);
            const secondBuyFees = 901.35 - (450.00 * 2);
            const totalFees = firstBuyFees + secondBuyFees;
            const totalDeposits = 932.40 + 901.35;
            const expectedReturn = -(totalFees / totalDeposits) * 100;
            
            assert.ok(Math.abs(stats.totalReturnPct - expectedReturn) < 0.05, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${totalFees.toFixed(2)} in fees), got ${stats.totalReturnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Fees should immediately reduce return at buy time',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 99.00, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();
            
            const expectedReturn = -1.0;
            assert.ok(Math.abs(stats.totalReturnPct - expectedReturn) < 0.1, 
                `Return should be ${expectedReturn}% immediately after buying with fees, got ${stats.totalReturnPct}%`);
        }
    },
    {
        name: 'Fees should reduce return: Price vs Total_Value difference',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 992.59 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'Ericsson B', Quantity: 11, Price: 90.10, Total_Value: -992.59 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();
            
            const priceValue = 11 * 90.10;
            const totalValue = 992.59;
            const fees = totalValue - priceValue;
            const expectedReturn = -(fees / totalValue) * 100;
            
            assert.ok(Math.abs(stats.totalReturnPct - expectedReturn) < 0.05, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${fees.toFixed(2)} in fees), got ${stats.totalReturnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Fees on multiple buys should accumulate in return',
        run: () => {
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 5, Price: 99.00, Total_Value: -500 }, // 5 in fees
                { Date: '2024-01-02', Action: 'Deposit', Total_Value: 500 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 5, Price: 99.00, Total_Value: -500 } // 5 in fees
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            const stats = engine.getStats();
            
            const totalFees = 10;
            const totalDeposits = 1500;
            const expectedReturn = -(totalFees / totalDeposits) * 100;
            
            assert.ok(Math.abs(stats.totalReturnPct - expectedReturn) < 0.1, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${totalFees} in total fees), got ${stats.totalReturnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Portfolio value should not drop incorrectly when selling all shares (Dec 11-12 scenario)',
        run: () => {
            // Simulating the Dec 11-12 scenario from transactions.csv
            // Need to include Dec 10 buy of ABB to have something to sell on Dec 12
            const transactions = [
                { Date: '2025-12-10', Action: 'Deposit', Total_Value: 147.12 },
                { Date: '2025-12-10', Action: 'Köp', Stock: 'ABB', Quantity: 2, Price: 679.00, Total_Value: -1360.04 },
                { Date: '2025-12-11', Action: 'Deposit', Total_Value: 1077.28 },
                { Date: '2025-12-11', Action: 'Köp', Stock: 'Ericsson B', Quantity: 12, Price: 89.24, Total_Value: -1072.49 },
                { Date: '2025-12-12', Action: 'Sälj', Stock: 'Ericsson B', Quantity: -12, Price: 90.34, Total_Value: 1082.45 },
                { Date: '2025-12-12', Action: 'Sälj', Stock: 'ABB', Quantity: -2, Price: 686.20, Total_Value: 1370.34 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            // Sort history by date (oldest first) for easier debugging
            history.sort((a, b) => a.date - b.date);
            
            // Find entries for Dec 11 and Dec 12
            const dec11Entries = history.filter(h => h.date.toISOString().slice(0, 10) === '2025-12-11');
            const dec12Entries = history.filter(h => h.date.toISOString().slice(0, 10) === '2025-12-12');
            
            // Get the last entry for each day (after all transactions on that day)
            const dec11 = dec11Entries[dec11Entries.length - 1];
            const dec12 = dec12Entries[dec12Entries.length - 1];
            
            assert.ok(dec11, 'Should have Dec 11 entry');
            assert.ok(dec12, 'Should have Dec 12 entry');
            
            console.log(`Dec 11: cash=${dec11.cash}, nav=${dec11.nav}, portfolioValue=${dec11.portfolioValue}`);
            console.log(`Dec 12: cash=${dec12.cash}, nav=${dec12.nav}, portfolioValue=${dec12.portfolioValue}`);
            
            // After Dec 11: deposit 1077.28, buy Ericsson B for 1072.49
            // Expected cash after Dec 11: 147.12 - 1360.04 + 1077.28 - 1072.49 = -1208.13 (negative means we spent more than deposits)
            // But wait, we need to account for the ABB purchase on Dec 10
            
            // Portfolio value on Dec 12 should be reasonable
            // After selling both stocks, we should have cash from all deposits and sales
            const expectedCashDec12 = 147.12 - 1360.04 + 1077.28 - 1072.49 + 1082.45 + 1370.34;
            const expectedNavDec12 = 0; // All stocks sold
            
            assert.ok(Math.abs(dec12.cash - expectedCashDec12) < 1,
                `Dec 12 cash should be around ${expectedCashDec12}, got ${dec12.cash}`);
            assert.strictEqual(dec12.nav, 0, `Dec 12 NAV should be 0 after selling all stocks, got ${dec12.nav}`);
            assert.ok(Math.abs(dec12.portfolioValue - expectedCashDec12) < 1,
                `Dec 12 portfolio value should be around ${expectedCashDec12}, got ${dec12.portfolioValue}`);
            
            // Portfolio value shouldn't drop dramatically from Dec 11 to Dec 12
            // Dec 11 should have stocks, Dec 12 should have cash from sales
            assert.ok(dec12.portfolioValue > 0, `Dec 12 portfolio value should be positive, got ${dec12.portfolioValue}`);
        }
    },
    {
        name: 'Portfolio value calculation with multiple transactions on same day (Dec 16 scenario)',
        run: () => {
            // Simulating the Dec 16 scenario from transactions.csv
            const transactions = [
                { Date: '2025-12-16', Action: 'Deposit', Total_Value: 549.70 },
                { Date: '2025-12-16', Action: 'Köp', Stock: 'Handelsbanken A', Quantity: 8, Price: 129.35, Total_Value: -1036.35 },
                { Date: '2025-12-16', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 500.00, Total_Value: -1001.50 },
                { Date: '2025-12-16', Action: 'Köp', Stock: 'SKF B', Quantity: 4, Price: 240.80, Total_Value: -964.64 },
                { Date: '2025-12-17', Action: 'Köp', Stock: 'ABB', Quantity: 2, Price: 681.20, Total_Value: -1364.44 },
                { Date: '2025-12-17', Action: 'Köp', Stock: 'SEB A', Quantity: 6, Price: 188.55, Total_Value: -1133.00 },
                { Date: '2025-12-17', Action: 'Köp', Stock: 'Ericsson B', Quantity: 12, Price: 89.60, Total_Value: -1076.81 },
                { Date: '2025-12-17', Action: 'Köp', Stock: 'SKF B', Quantity: 4, Price: 238.00, Total_Value: -953.43 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            // Find entries for Dec 16 and Dec 17
            const dec16 = history.find(h => h.date.toISOString().slice(0, 10) === '2025-12-16');
            const dec17 = history.find(h => h.date.toISOString().slice(0, 10) === '2025-12-17');
            
            assert.ok(dec16, 'Should have Dec 16 entry');
            assert.ok(dec17, 'Should have Dec 17 entry');
            
            // Portfolio value should be calculated correctly
            // Dec 16: deposit 549.70, buy stocks worth ~3002.49 (with fees)
            // Dec 17: buy more stocks
            const dec16ExpectedCash = 549.70 - 1036.35 - 1001.50 - 964.64;
            const dec16ExpectedNAV = 8 * 129.35 + 2 * 500.00 + 4 * 240.80;
            const dec16ExpectedValue = dec16ExpectedCash + dec16ExpectedNAV;
            
            assert.ok(Math.abs(dec16.portfolioValue - dec16ExpectedValue) < 10,
                `Dec 16 portfolio value should be around ${dec16ExpectedValue}, got ${dec16.portfolioValue}`);
            
            // Value should increase from Dec 16 to Dec 17 (more purchases)
            assert.ok(dec17.portfolioValue > dec16.portfolioValue || Math.abs(dec17.portfolioValue - dec16.portfolioValue) < 100,
                `Portfolio value should be reasonable: Dec 16=${dec16.portfolioValue}, Dec 17=${dec17.portfolioValue}`);
        }
    },
    {
        name: 'NAV should be zero when position is zero, even if avgPrice exists',
        run: () => {
            // This test checks the bug: when a position becomes 0, avgPrice might still exist
            // and if there's a floating point issue, NAV might be calculated incorrectly
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 50, Total_Value: -500 },
                { Date: '2024-01-03', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 60, Total_Value: 600 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            // After selling all shares, position should be 0 (or undefined if deleted) and NAV should be 0
            const lastEntry = history[history.length - 1];
            const abcPosition = lastEntry.positions['ABC'];
            assert.ok(abcPosition === 0 || abcPosition === undefined, 
                `Position should be 0 or undefined after selling all shares, got ${abcPosition}`);
            assert.strictEqual(lastEntry.nav, 0, 'NAV should be 0 when all positions are sold');
            
            // Check that avgPrice doesn't cause issues
            const entryAfterSale = history.find(h => 
                h.date.toISOString().slice(0, 10) === '2024-01-03'
            );
            assert.ok(entryAfterSale, 'Should have entry after sale');
            const abcPosAfterSale = entryAfterSale.positions['ABC'];
            assert.ok(abcPosAfterSale === 0 || abcPosAfterSale === undefined,
                `Position should be 0 or undefined after sale, got ${abcPosAfterSale}`);
            assert.strictEqual(entryAfterSale.nav, 0, 'NAV should be 0 after selling all shares');
        }
    },
    {
        name: 'Portfolio value bug: selling then buying same stock in reverse processing',
        run: () => {
            // This reproduces the actual bug scenario
            // When processing in reverse: sell first (position = 0), then buy (avgPrice set)
            // NAV calculation for the sell date might use wrong avgPrice
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-03', Action: 'Sälj', Stock: 'ABC', Quantity: -10, Price: 110, Total_Value: 1100 },
                { Date: '2024-01-04', Action: 'Köp', Stock: 'ABC', Quantity: 5, Price: 120, Total_Value: -600 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            // Sort by date for easier checking
            history.sort((a, b) => a.date - b.date);
            
            // Find Jan 3 entry (after selling all, before buying again)
            const jan3Entries = history.filter(h => h.date.toISOString().slice(0, 10) === '2024-01-03');
            const jan3 = jan3Entries[jan3Entries.length - 1]; // Last entry for that day
            
            // After selling all on Jan 3, position should be 0 (or undefined), NAV should be 0
            const abcPosJan3 = jan3.positions['ABC'];
            assert.ok(abcPosJan3 === 0 || abcPosJan3 === undefined, 
                `Position should be 0 or undefined after selling all, got ${abcPosJan3}`);
            assert.strictEqual(jan3.nav, 0, 'NAV should be 0 when position is 0 or undefined');
            
            // Portfolio value should be cash only
            const expectedCashJan3 = 1000 - 1000 + 1100;
            assert.ok(Math.abs(jan3.cash - expectedCashJan3) < 0.01, 
                `Cash should be ${expectedCashJan3}, got ${jan3.cash}`);
            assert.ok(Math.abs(jan3.portfolioValue - expectedCashJan3) < 0.01,
                `Portfolio value should equal cash when NAV is 0, got ${jan3.portfolioValue}`);
        }
    },
    {
        name: 'BUG FIX: NAV calculated correctly when multiple transactions occur on same day',
        run: () => {
            // The bug: When multiple transactions occur on the same day, NAV was calculated
            // after each transaction instead of after all transactions for that day.
            // This caused NAV to be calculated before all positions were updated.
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 100, Total_Value: -1000 },
                { Date: '2024-01-02', Action: 'Sälj', Stock: 'ABC', Quantity: -5, Price: 110, Total_Value: 550 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            const history = engine.process();
            
            // Sort by date
            history.sort((a, b) => a.date - b.date);
            
            // Find entries
            const jan1 = history.find(h => h.date.toISOString().slice(0, 10) === '2024-01-01');
            const jan2 = history.find(h => h.date.toISOString().slice(0, 10) === '2024-01-02');
            
            // On Jan 1, after processing both deposit and buy, NAV should be 10 * 100 = 1000
            assert.strictEqual(jan1.nav, 1000, `Jan 1 NAV should be 1000 after buying 10 shares, got ${jan1.nav}`);
            assert.strictEqual(jan1.portfolioValue, 1000, `Jan 1 portfolio value should be 1000, got ${jan1.portfolioValue}`);
            assert.strictEqual(jan1.positions['ABC'], 10, `Jan 1 should have 10 shares of ABC`);
            
            // On Jan 2, after selling 5 shares, NAV should be 5 * 100 = 500 (using avgPrice from Jan 1)
            assert.strictEqual(jan2.nav, 500, `Jan 2 NAV should be 500 after selling 5 shares, got ${jan2.nav}`);
            assert.strictEqual(jan2.portfolioValue, 1050, `Jan 2 portfolio value should be 1050 (550 cash + 500 NAV), got ${jan2.portfolioValue}`);
            assert.strictEqual(jan2.positions['ABC'], 5, `Jan 2 should have 5 shares of ABC`);
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
