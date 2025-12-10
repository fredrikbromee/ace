const assert = require('assert');
const path = require('path');

let Papa;
try {
    Papa = require('papaparse');
} catch (e) {
    console.error('papaparse not found. Install with: npm install papaparse');
    process.exit(1);
}

global.CONFIG = {
    files: {
        transactions: 'transactions.csv'
    },
    requiredColumns: {
        transactions: ['Date', 'Action', 'Stock', 'Quantity', 'Price', 'Total_Value']
    }
};

global.Utils = {
    showError: (msg) => {
        console.error('Error:', msg);
    }
};

global.Papa = Papa;
const DataService = require(path.join(__dirname, '..', 'js/dataService.js'));

function createCSV(data) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => row[h] || '').join(','));
    return [headers.join(','), ...rows].join('\n');
}

const validCSV = `Date,Account,Action,Stock,Quantity,Price,Total_Value
2024-01-01,123,Deposit,,,,"1000"
2024-01-02,123,Köp,ABC,10,50,-500`;

const emptyCSV = `Date,Account,Action,Stock,Quantity,Price,Total_Value`;

const missingColumnsCSV = `Date,Action
2024-01-01,Deposit`;

const invalidCSV = `Date,Account,Action,Stock,Quantity,Price,Total_Value
2024-01-01,123,Deposit,,,,"invalid"`;

function setupPapaMock(csvString, forceErrors = null) {
    const originalParse = Papa.parse;
    Papa.parse = (filename, options) => {
        if (options.download) {
            const result = Papa.parse(csvString, {
                header: true,
                skipEmptyLines: options.skipEmptyLines !== false,
                dynamicTyping: options.dynamicTyping !== false,
                quotes: options.quotes !== false,
                quoteChar: options.quoteChar || '"',
                escapeChar: options.escapeChar || '"',
            });
            
            if (forceErrors) {
                result.errors = forceErrors;
            }
            
            setTimeout(() => {
                if (options.complete) {
                    options.complete(result);
                }
            }, 0);
        } else {
            return originalParse(filename, options);
        }
    };
    return () => { Papa.parse = originalParse; };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const tests = [
    {
        name: 'fetchAndParse - valid CSV',
        run: async () => {
            const restore = setupPapaMock(validCSV);
            
            const result = await DataService.fetchAndParse('test.csv', ['Date', 'Action', 'Stock']);
            await delay(10);

            assert.strictEqual(Array.isArray(result), true);
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].Date, '2024-01-01');
            assert.strictEqual(result[0].Action, 'Deposit');
            assert.strictEqual(result[1].Action, 'Köp');
            assert.strictEqual(result[1].Stock, 'ABC');

            restore();
        }
    },
    {
        name: 'fetchAndParse - parsing errors',
        run: async () => {
            const restore = setupPapaMock(invalidCSV, [{ message: 'Invalid CSV format', row: 1 }]);

            try {
                await DataService.fetchAndParse('test.csv', ['Date']);
                await delay(10);
                assert.fail('Should have thrown an error');
            } catch (e) {
                assert(e.message.includes('Parsing error'));
            }

            restore();
        }
    },
    {
        name: 'fetchAndParse - empty file',
        run: async () => {
            const restore = setupPapaMock(emptyCSV);

            try {
                await DataService.fetchAndParse('test.csv', ['Date']);
                await delay(10);
                assert.fail('Should have thrown an error');
            } catch (e) {
                assert(e.message.includes('empty'));
            }

            restore();
        }
    },
    {
        name: 'fetchAndParse - missing columns',
        run: async () => {
            const restore = setupPapaMock(missingColumnsCSV);

            try {
                await DataService.fetchAndParse('test.csv', ['Date', 'Action', 'Stock']);
                await delay(10);
                assert.fail('Should have thrown an error');
            } catch (e) {
                assert(e.message.includes('Missing required columns'));
            }

            restore();
        }
    },
    {
        name: 'loadData - success',
        run: async () => {
            const restore = setupPapaMock(validCSV);

            const result = await DataService.loadData();
            await delay(10);

            assert.strictEqual(result.transactions !== undefined, true);
            assert.strictEqual(Array.isArray(result.transactions), true);
            assert.strictEqual(result.transactions.length, 2);

            restore();
        }
    },
    {
        name: 'loadData - error handling calls Utils.showError',
        run: async () => {
            const originalShowError = global.Utils.showError;
            const errorMessages = [];
            
            global.Utils.showError = (msg) => {
                errorMessages.push(msg);
            };

            const badCSV = `Date,Account,Action,Stock,Quantity,Price,Total_Value`;
            const restore = setupPapaMock(badCSV, [{ message: 'Test error', row: 1 }]);

            try {
                await DataService.loadData();
                await delay(10);
                assert.fail('Should have thrown an error');
            } catch (e) {
                assert.strictEqual(errorMessages.length > 0, true, 'Utils.showError should have been called');
                assert(e.message.includes('Parsing error'));
            }

            global.Utils.showError = originalShowError;
            restore();
        }
    },
    {
        name: 'fetchAndParse - invalid numeric value with spaces',
        run: async () => {
            const csvWithSpaces = `Date,Account,Action,Stock,Quantity,Price,Total_Value
2024-01-01,123,Deposit,,,,"1 893.94"`;

            const restore = setupPapaMock(csvWithSpaces);

            try {
                await DataService.fetchAndParse('test.csv', ['Date', 'Action', 'Total_Value']);
                await delay(10);
                assert.fail('Should have thrown an error');
            } catch (e) {
                assert(e.message.includes('contains spaces'), 'Should detect spaces in numeric value');
                assert(e.message.includes('row 2'), 'Should indicate row number');
            }

            restore();
        }
    },
    {
        name: 'fetchAndParse - invalid numeric value (NaN)',
        run: async () => {
            const csvWithNaN = `Date,Account,Action,Stock,Quantity,Price,Total_Value
2024-01-01,123,Köp,ABC,10,invalid,-500`;

            const restore = setupPapaMock(csvWithNaN);

            try {
                await DataService.fetchAndParse('test.csv', ['Date', 'Action', 'Price']);
                await delay(10);
                assert.fail('Should have thrown an error');
            } catch (e) {
                assert(e.message.includes('not a valid number'), 'Should detect invalid number');
                assert(e.message.includes('Price'), 'Should indicate column name');
            }

            restore();
        }
    }
];

// Test runner
async function runTests() {
    console.log('Running DataService Tests...\n');
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test.run();
            console.log(`✅ ${test.name}`);
            passed++;
        } catch (e) {
            console.log(`❌ ${test.name}`);
            console.log(`   ${e.message}`);
            if (e.stack) {
                const stackLines = e.stack.split('\n');
                if (stackLines.length > 1) {
                    console.log(`   ${stackLines[1].trim()}`);
                }
            }
            failed++;
        }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    return failed === 0;
}

if (require.main === module) {
    runTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { DataService, tests, runTests };
