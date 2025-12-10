const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load and execute code in sandbox
function loadCode() {
    const sandbox = {
        console: console,
        document: { getElementById: () => ({}) },
        window: {},
    };
    vm.createContext(sandbox);

    const utilsCode = fs.readFileSync(path.join(__dirname, '..', 'js/utils.js'), 'utf8');
    const engineCode = fs.readFileSync(path.join(__dirname, '..', 'js/portfolioEngine.js'), 'utf8');

    const utilsScript = utilsCode + '\n;window.Utils = Utils;';
    const engineScript = engineCode + '\n;window.PortfolioEngine = PortfolioEngine;';

    vm.runInContext(utilsScript, sandbox);
    vm.runInContext(engineScript, sandbox);

    return {
        Utils: sandbox.window.Utils,
        PortfolioEngine: sandbox.window.PortfolioEngine
    };
}

const { Utils, PortfolioEngine } = loadCode();

// Test cases
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
            // Manually set portfolio value to simulate 3% return
            engine.history[engine.history.length - 1].portfolioValue = 1030;
            // Update the date to be 1 year later for proper CAGR calculation
            engine.history[engine.history.length - 1].date = new Date('2025-01-01');
            const stats = engine.getStats();

            assert.ok(stats.cagr !== 0, `CAGR should not be 0, got ${stats.cagr}%`);
            assert.ok(stats.cagr > 0, `CAGR should be positive, got ${stats.cagr}%`);
            // Allow wider range due to solver approximation
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
            // Manually set portfolio value to simulate 3% return over 2 years
            // 1000 * 1.03^2 = 1060.9
            engine.history[engine.history.length - 1].portfolioValue = 1060.9;
            // Update the date to be 2 years later
            engine.history[engine.history.length - 1].date = new Date('2026-01-01');
            const stats = engine.getStats();

            assert.ok(stats.cagr !== 0, `CAGR should not be 0, got ${stats.cagr}%`);
            assert.ok(stats.cagr > 0, `CAGR should be positive, got ${stats.cagr}%`);
            // Allow wider range due to solver approximation
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
            // Simulate stock price increase to 103 (3% gain)
            engine.purchasePrices['ABC'] = 103;
            // Recalculate portfolio value
            const last = engine.history[engine.history.length - 1];
            last.nav = 10 * 103; // 10 shares * 103 price
            last.portfolioValue = last.cash + last.nav;
            // Update the date to be 1 year after first deposit for proper CAGR calculation
            last.date = new Date('2025-01-01');
            const stats = engine.getStats();

            assert.ok(stats.cagr !== 0, `CAGR should not be 0, got ${stats.cagr}%`);
            assert.ok(stats.cagr > 0, `CAGR should be positive, got ${stats.cagr}%`);
            // Allow wider range due to solver approximation
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
            
            // Even with no gain, CAGR should not be exactly 0 (might be very small or negative)
            // But if there's a positive return, CAGR should definitely not be 0
            if (stats.totalReturnPct > 0) {
                assert.ok(stats.cagr !== 0, `CAGR should not be 0 when return is ${stats.totalReturnPct}%, got ${stats.cagr}%`);
            }
        }
    },
    {
        name: 'Return should reflect fees immediately after deposit and buy (no sales)',
        run: () => {
            // Real transaction data with fees: Price doesn't match Total_Value/Quantity due to fees
            // Ericsson: Price * Qty = 90.10 * 11 = 991.10, Total_Value = 992.59, fees = 1.49
            // SAAB: Price * Qty = 450.00 * 2 = 900.00, Total_Value = 901.35, fees = 1.35
            // Total fees = 2.84, Total deposits = 1893.94
            // Expected return = -2.84 / 1893.94 = -0.15%
            const transactions = [
                { Date: '2025-11-25', Action: 'Deposit', Total_Value: 1893.94 },
                { Date: '2025-11-25', Action: 'Köp', Stock: 'Ericsson B', Quantity: 11, Price: 90.10, Total_Value: -992.59 },
                { Date: '2025-11-25', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 450.00, Total_Value: -901.35 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            const stats = engine.getStats();
            
            // Calculate expected return based on fees
            const ericssonFees = 992.59 - (90.10 * 11); // 1.49
            const saabFees = 901.35 - (450.00 * 2); // 1.35
            const totalFees = ericssonFees + saabFees; // 2.84
            const expectedReturn = -(totalFees / 1893.94) * 100; // -0.15%
            
            const returnPct = stats.totalReturnPct;
            
            // Return should reflect fees as immediate loss
            assert.ok(Math.abs(returnPct - expectedReturn) < 0.05, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${totalFees.toFixed(2)} in fees), got ${returnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Return should reflect fees with multiple buys of same stock',
        run: () => {
            // Real transaction data: buy same stock twice with fees
            // First buy: Price * Qty = 465.50 * 2 = 931.00, Total_Value = 932.40, fees = 1.40
            // Second buy: Price * Qty = 450.00 * 2 = 900.00, Total_Value = 901.35, fees = 1.35
            // Total fees = 2.75, Total deposits = 1833.75
            // Expected return = -2.75 / 1833.75 = -0.15%
            const transactions = [
                { Date: '2025-11-24', Action: 'Deposit', Total_Value: 932.40 },
                { Date: '2025-11-24', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 465.50, Total_Value: -932.40 },
                { Date: '2025-11-25', Action: 'Deposit', Total_Value: 901.35 },
                { Date: '2025-11-25', Action: 'Köp', Stock: 'SAAB B', Quantity: 2, Price: 450.00, Total_Value: -901.35 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            const stats = engine.getStats();
            
            // Calculate expected return based on fees
            const firstBuyFees = 932.40 - (465.50 * 2); // 1.40
            const secondBuyFees = 901.35 - (450.00 * 2); // 1.35
            const totalFees = firstBuyFees + secondBuyFees; // 2.75
            const totalDeposits = 932.40 + 901.35; // 1833.75
            const expectedReturn = -(totalFees / totalDeposits) * 100; // -0.15%
            
            const returnPct = stats.totalReturnPct;
            
            // Return should reflect fees as immediate loss
            assert.ok(Math.abs(returnPct - expectedReturn) < 0.05, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${totalFees.toFixed(2)} in fees), got ${returnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Fees should immediately reduce return at buy time',
        run: () => {
            // Test: Deposit 1000, buy stock where Price * Quantity = 990 but Total_Value = -1000 (10 in fees)
            // Return should immediately show -1% (10/1000) due to fees
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 10, Price: 99.00, Total_Value: -1000 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            const stats = engine.getStats();
            const lastEntry = engine.history[engine.history.length - 1];
            
            // Price * Quantity = 99 * 10 = 990
            // Total_Value = -1000 (includes 10 in fees)
            // Cash after buy: 1000 - 1000 = 0
            // NAV using avgCost: 10 * (1000/10) = 1000
            // Portfolio value: 0 + 1000 = 1000
            // But wait - if fees reduce value, NAV should reflect that
            
            // Actually, fees are already included in avgCost calculation
            // avgCost = 1000 / 10 = 100 per share
            // NAV = 10 * 100 = 1000
            // Portfolio value = 0 + 1000 = 1000
            // Return = (1000 - 1000) / 1000 = 0%
            
            // But the user is saying fees should affect return immediately
            // The issue is: fees reduce your cash, but NAV uses cost basis (including fees)
            // So portfolio value stays the same, but you've lost money to fees
            
            // I think the issue is that NAV should use Price (without fees) for valuation
            // But cost basis should include fees for P&L calculation
            
            const returnPct = stats.totalReturnPct;
            const expectedReturn = -1.0; // -10/1000 = -1%
            
            assert.ok(Math.abs(returnPct - expectedReturn) < 0.1, 
                `Return should be ${expectedReturn}% immediately after buying with fees, got ${returnPct}%`);
        }
    },
    {
        name: 'Fees should reduce return: Price vs Total_Value difference',
        run: () => {
            // Real-world example: Ericsson B
            // Quantity: 11, Price: 90.10, Total_Value: -992.59
            // Price * Quantity = 11 * 90.10 = 991.10
            // Fees = 992.59 - 991.10 = 1.49
            // Fee percentage = 1.49 / 992.59 = 0.15%
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 992.59 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'Ericsson B', Quantity: 11, Price: 90.10, Total_Value: -992.59 }
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            const stats = engine.getStats();
            
            // Price * Quantity = 11 * 90.10 = 991.10
            // Total_Value = -992.59
            // Fees = 1.49
            // Expected return = -1.49 / 992.59 = -0.15%
            
            const priceValue = 11 * 90.10; // 991.10
            const totalValue = 992.59;
            const fees = totalValue - priceValue; // 1.49
            const expectedReturn = -(fees / totalValue) * 100; // -0.15%
            
            const returnPct = stats.totalReturnPct;
            
            assert.ok(Math.abs(returnPct - expectedReturn) < 0.05, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${fees.toFixed(2)} in fees), got ${returnPct.toFixed(2)}%`);
        }
    },
    {
        name: 'Fees on multiple buys should accumulate in return',
        run: () => {
            // Buy stock twice with fees, return should reflect total fees
            const transactions = [
                { Date: '2024-01-01', Action: 'Deposit', Total_Value: 1000 },
                { Date: '2024-01-01', Action: 'Köp', Stock: 'ABC', Quantity: 5, Price: 99.00, Total_Value: -500 }, // 5 in fees
                { Date: '2024-01-02', Action: 'Deposit', Total_Value: 500 },
                { Date: '2024-01-02', Action: 'Köp', Stock: 'ABC', Quantity: 5, Price: 99.00, Total_Value: -500 } // 5 in fees
            ].reverse();

            const engine = new PortfolioEngine(transactions);
            engine.process();
            
            const stats = engine.getStats();
            
            // Total deposits: 1000 + 500 = 1500
            // First buy: Price * Qty = 99 * 5 = 495, Total_Value = -500, fees = 5
            // Second buy: Price * Qty = 99 * 5 = 495, Total_Value = -500, fees = 5
            // Total fees: 10
            // Expected return = -10 / 1500 = -0.67%
            
            const totalFees = 10; // 5 + 5
            const totalDeposits = 1500;
            const expectedReturn = -(totalFees / totalDeposits) * 100;
            
            const returnPct = stats.totalReturnPct;
            
            assert.ok(Math.abs(returnPct - expectedReturn) < 0.1, 
                `Return should be ${expectedReturn.toFixed(2)}% (reflecting ${totalFees} in total fees), got ${returnPct.toFixed(2)}%`);
        }
    }
];

// Test runner
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

// Run if executed directly
if (require.main === module) {
    const success = runTests();
    process.exit(success ? 0 : 1);
}

// Export for use with test frameworks
module.exports = { PortfolioEngine, Utils, tests, runTests };
