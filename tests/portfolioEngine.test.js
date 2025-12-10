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
