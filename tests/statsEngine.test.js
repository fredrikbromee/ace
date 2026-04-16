const assert = require('assert');
const path = require('path');

const StatsEngine = require(path.join(__dirname, '..', 'js/statsEngine.js'));

// Helper: build TWR series from cumulative percent values, one trading day apart
function makeSeries(twrValues, startDate = '2024-01-01') {
    const start = new Date(startDate);
    return twrValues.map((twr, i) => ({
        date: new Date(start.getTime() + i * 24 * 60 * 60 * 1000),
        twr
    }));
}

function approx(actual, expected, tol, msg) {
    assert.ok(
        Math.abs(actual - expected) < tol,
        `${msg || ''} expected ${expected}, got ${actual} (tol ${tol})`
    );
}

const tests = [
    {
        name: 'dailyReturns - flat TWR yields zeros',
        run: () => {
            const series = makeSeries([0, 0, 0, 0]);
            const r = StatsEngine.dailyReturns(series);
            assert.strictEqual(r.length, 3);
            r.forEach(v => assert.strictEqual(v, 0));
        }
    },
    {
        name: 'dailyReturns - derived from wealth ratio, not raw delta',
        run: () => {
            // Cumulative TWR 0% → 10% → 21% means wealth 1.0 → 1.10 → 1.21,
            // i.e. +10% then +10% — NOT +10pp then +11pp.
            const series = makeSeries([0, 10, 21]);
            const r = StatsEngine.dailyReturns(series);
            approx(r[0], 0.10, 1e-9, 'first daily return');
            approx(r[1], 0.10, 1e-9, 'second daily return');
        }
    },
    {
        name: 'mean and std on small sample',
        run: () => {
            assert.strictEqual(StatsEngine.mean([1, 2, 3, 4, 5]), 3);
            // Sample std (ddof=1) of [2, 4, 4, 4, 5, 5, 7, 9]:
            // mean=5, sum of squared deviations=32, sample variance=32/7, std=sqrt(32/7)
            approx(StatsEngine.std([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7), 1e-9);
        }
    },
    {
        name: 'std returns 0 for too-short input',
        run: () => {
            assert.strictEqual(StatsEngine.std([]), 0);
            assert.strictEqual(StatsEngine.std([5]), 0);
        }
    },
    {
        name: 'annualizedReturn = mean * 252',
        run: () => {
            const r = [0.001, 0.002, -0.001, 0.001];
            approx(StatsEngine.annualizedReturn(r),
                StatsEngine.mean(r) * 252, 1e-12);
        }
    },
    {
        name: 'sharpe - constant positive returns gives null (zero volatility)',
        run: () => {
            const series = makeSeries([0, 1, 2.01, 3.0301]); // exact +1% per day
            const r = StatsEngine.dailyReturns(series);
            const s = StatsEngine.sharpe(r);
            assert.strictEqual(s, null);
        }
    },
    {
        name: 'sharpe - matches manual calculation',
        run: () => {
            // Returns: +1%, -1%, +1%, -1%
            // mean = 0, std (sample) > 0, so sharpe = 0
            const r = [0.01, -0.01, 0.01, -0.01];
            const s = StatsEngine.sharpe(r);
            approx(s, 0, 1e-9);
        }
    },
    {
        name: 'sortino - equals or exceeds sharpe when downside is limited',
        run: () => {
            // Mostly positive returns with one drop
            const r = [0.02, 0.01, -0.005, 0.015, 0.01];
            const sharpe = StatsEngine.sharpe(r);
            const sortino = StatsEngine.sortino(r);
            assert.ok(sortino > sharpe,
                `sortino (${sortino}) should exceed sharpe (${sharpe}) when most returns are positive`);
        }
    },
    {
        name: 'sortino - returns null when no negative returns exist',
        run: () => {
            const r = [0.01, 0.02, 0.005, 0.015];
            const s = StatsEngine.sortino(r);
            assert.strictEqual(s, null);
        }
    },
    {
        name: 'maxDrawdown - monotonically increasing series is 0',
        run: () => {
            const series = makeSeries([0, 5, 10, 15, 20]);
            assert.strictEqual(StatsEngine.maxDrawdown(series), 0);
        }
    },
    {
        name: 'maxDrawdown - known peak-trough sequence',
        run: () => {
            // Wealth path: 1.0 → 1.10 → 1.21 → 0.968 (peak 1.21, trough 0.968)
            // Drawdown = (1.21 - 0.968) / 1.21 = 0.20
            const series = makeSeries([0, 10, 21, -3.2]);
            approx(StatsEngine.maxDrawdown(series), 0.20, 1e-9);
        }
    },
    {
        name: 'maxDrawdown - tracks deepest drawdown across multiple peaks',
        run: () => {
            // Wealth: 1.0, 1.5, 1.0 (DD 33.3%), 1.8, 0.9 (DD 50%)
            const series = makeSeries([0, 50, 0, 80, -10]);
            approx(StatsEngine.maxDrawdown(series), 0.5, 1e-9);
        }
    },
    {
        name: 'cagr - one full year of +20% returns ≈ 20%',
        run: () => {
            const start = new Date('2024-01-01');
            const end = new Date(start.getTime() + 365.25 * 24 * 60 * 60 * 1000);
            const series = [
                { date: start, twr: 0 },
                { date: end, twr: 20 }
            ];
            approx(StatsEngine.cagr(series), 0.20, 1e-6);
        }
    },
    {
        name: 'calmar - cagr / maxDrawdown',
        run: () => {
            const start = new Date('2024-01-01');
            const end = new Date(start.getTime() + 365.25 * 24 * 60 * 60 * 1000);
            const series = [
                { date: start, twr: 0 },
                { date: new Date(start.getTime() + 100 * 24 * 60 * 60 * 1000), twr: 50 },
                { date: new Date(start.getTime() + 200 * 24 * 60 * 60 * 1000), twr: 0 }, // wealth back to 1.0, DD = 33.3%
                { date: end, twr: 20 }
            ];
            const dd = StatsEngine.maxDrawdown(series);
            const cagr = StatsEngine.cagr(series);
            const calmar = StatsEngine.calmar(series);
            approx(calmar, cagr / dd, 1e-9);
        }
    },
    {
        name: 'calmar - returns null when no drawdown',
        run: () => {
            const series = makeSeries([0, 5, 10, 15]);
            assert.strictEqual(StatsEngine.calmar(series), null);
        }
    },
    {
        name: 'compute - returns all four stats',
        run: () => {
            const series = makeSeries([0, 5, 3, 8, 6, 10]);
            const stats = StatsEngine.compute(series);
            assert.ok('sharpe' in stats);
            assert.ok('sortino' in stats);
            assert.ok('maxDrawdown' in stats);
            assert.ok('calmar' in stats);
        }
    }
];

function runTests() {
    console.log('Running StatsEngine Tests...\n');
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

module.exports = { tests, runTests };
