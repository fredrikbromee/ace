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
