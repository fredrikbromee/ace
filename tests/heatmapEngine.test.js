const assert = require('assert');
const path = require('path');

const HeatmapEngine = require(path.join(__dirname, '..', 'js/heatmapEngine.js'));

// Build a TWR series from [dateString, cumulativeTwrPercent] pairs.
function series(pairs) {
    return pairs.map(([d, twr]) => ({ date: new Date(d), twr }));
}

function approx(actual, expected, tol, msg) {
    assert.ok(
        Math.abs(actual - expected) < tol,
        `${msg || ''} expected ${expected}, got ${actual} (tol ${tol})`
    );
}

const tests = [
    {
        name: 'monthKey - UTC year-month',
        run: () => {
            assert.strictEqual(HeatmapEngine.monthKey(new Date('2025-11-24')), '2025-11');
            assert.strictEqual(HeatmapEngine.monthKey(new Date('2026-01-01')), '2026-01');
        }
    },
    {
        name: 'isoWeekKey - week belongs to year/month of its Thursday',
        run: () => {
            // Mon 2025-12-29 .. Sun 2026-01-04 → Thursday 2026-01-01 → ISO 2026-W01
            assert.strictEqual(HeatmapEngine.isoWeekKey(new Date('2025-12-29')), '2026-W01');
            assert.strictEqual(HeatmapEngine.isoWeekKey(new Date('2026-01-01')), '2026-W01');
            // Mon 2026-01-05 → Thursday 2026-01-08 → ISO 2026-W02
            assert.strictEqual(HeatmapEngine.isoWeekKey(new Date('2026-01-05')), '2026-W02');
        }
    },
    {
        name: 'periodReturns - chains off cumulative wealth, first period from inception',
        run: () => {
            // wealth 1.0 → 1.10 → 1.21 → 1.331 over Jan/Feb/Mar = three +10% months
            const s = series([
                ['2025-01-30', 0],
                ['2025-01-31', 10],
                ['2025-02-28', 21],
                ['2025-03-31', 33.1],
            ]);
            const p = HeatmapEngine.periodReturns(s, d => HeatmapEngine.monthKey(d));
            assert.strictEqual(p.length, 3);
            assert.deepStrictEqual(p.map(x => x.key), ['2025-01', '2025-02', '2025-03']);
            approx(p[0].return, 0.10, 1e-9, 'Jan');
            approx(p[1].return, 0.10, 1e-9, 'Feb');
            approx(p[2].return, 0.10, 1e-9, 'Mar');
        }
    },
    {
        name: 'periodReturns - empty / single-entry series',
        run: () => {
            assert.deepStrictEqual(HeatmapEngine.periodReturns([], d => HeatmapEngine.monthKey(d)), []);
            const one = HeatmapEngine.periodReturns(series([['2025-01-31', 0]]), d => HeatmapEngine.monthKey(d));
            assert.strictEqual(one.length, 1);
            approx(one[0].return, 0, 1e-12, 'single point return is zero');
        }
    },
    {
        name: 'monthlyGrid - year rows, month cells, compounded year total',
        run: () => {
            const s = series([
                ['2025-11-01', 0],
                ['2025-11-30', 10],   // Nov +10%
                ['2025-12-31', 0],    // Dec back to wealth 1.0 → -9.09%
                ['2026-01-31', 5],    // Jan +5% (wealth 1.05)
            ]);
            const g = HeatmapEngine.monthlyGrid(s);
            assert.deepStrictEqual(g.years, [2025, 2026]);
            approx(g.byYearMonth[2025][10].return, 0.10, 1e-9, 'Nov (month index 10)');
            approx(g.byYearMonth[2025][11].return, 1.0 / 1.1 - 1, 1e-9, 'Dec');
            approx(g.byYearMonth[2026][0].return, 0.05, 1e-9, 'Jan 2026');
            // 2025 total = wealth went 1.0 → 1.0 = 0%
            approx(g.yearTotals[2025], 0, 1e-9, '2025 total');
            approx(g.yearTotals[2026], 0.05, 1e-9, '2026 total');
        }
    },
    {
        name: 'monthlyGrid - absolute mode reports % unit and value === return',
        run: () => {
            const s = series([['2026-01-31', 0], ['2026-02-28', 5]]);
            const g = HeatmapEngine.monthlyGrid(s);
            assert.strictEqual(g.unit, '%');
            assert.strictEqual(g.mode, 'absolute');
            const feb = g.byYearMonth[2026][1];
            approx(feb.value, feb.return, 1e-12, 'value mirrors return in absolute mode');
        }
    },
    {
        name: 'monthlyGrid - outperformance is portfolio minus benchmark per month',
        run: () => {
            const port = series([['2026-01-01', 0], ['2026-01-31', 10], ['2026-02-28', 21]]);   // +10%, +10%
            const bench = series([['2026-01-01', 0], ['2026-01-31', 4], ['2026-02-28', 8.16]]);  // +4%, +4%
            const g = HeatmapEngine.monthlyGrid(port, bench, 'outperformance');
            assert.strictEqual(g.unit, 'pp');
            assert.strictEqual(g.mode, 'outperformance');
            approx(g.byYearMonth[2026][0].value, 0.06, 1e-9, 'Jan gap');
            approx(g.byYearMonth[2026][1].value, 0.06, 1e-9, 'Feb gap');
            approx(g.byYearMonth[2026][0].return, 0.10, 1e-9, 'underlying return still present');
            // Year total = compounded port (0.21) − compounded bench (0.0816)
            approx(g.yearTotals[2026], 0.21 - 0.0816, 1e-9, '2026 outperformance total');
        }
    },
    {
        name: 'monthlyGrid - outperformance without a benchmark falls back to absolute',
        run: () => {
            const s = series([['2026-01-31', 0], ['2026-02-28', 5]]);
            const g = HeatmapEngine.monthlyGrid(s, null, 'outperformance');
            assert.strictEqual(g.unit, '%');
            assert.strictEqual(g.mode, 'absolute');
        }
    },
    {
        name: 'weeklyGrid - outperformance per week and per-month total',
        run: () => {
            const port = series([['2026-01-05', 0], ['2026-01-09', 2]]);    // W02 +2%
            const bench = series([['2026-01-05', 0], ['2026-01-09', 0.5]]); // W02 +0.5%
            const g = HeatmapEngine.weeklyGrid(port, bench, 'outperformance');
            assert.strictEqual(g.unit, 'pp');
            assert.strictEqual(g.rows.length, 1);
            approx(g.rows[0].weeks[0].value, 0.015, 1e-6, 'week gap');
            approx(g.rows[0].total, 0.015, 1e-6, 'month-row gap total');
        }
    },
    {
        name: 'weeklyGrid - weeks grouped into month rows by their Thursday',
        run: () => {
            // Two weeks in Jan 2026 plus one in Feb 2026.
            const s = series([
                ['2026-01-05', 0],   // W02 start
                ['2026-01-09', 2],   // W02 end  (+2%)
                ['2026-01-12', 2],   // W03 start
                ['2026-01-16', 4.04],// W03 end  (wealth 1.0404 → +2%)
                ['2026-02-02', 4.04],// W06 start (Feb)
                ['2026-02-06', 6.12],// W06 end  (+2%)
            ]);
            const g = HeatmapEngine.weeklyGrid(s);
            assert.strictEqual(g.rows.length, 2, 'two month rows');
            assert.strictEqual(g.rows[0].monthKey, '2026-01');
            assert.strictEqual(g.rows[1].monthKey, '2026-02');
            assert.strictEqual(g.rows[0].weeks.length, 2, 'Jan has two weeks');
            assert.strictEqual(g.maxCols, 2);
            approx(g.rows[0].weeks[0].return, 0.02, 1e-6, 'first week');
            approx(g.rows[0].total, 1.0404 / 1.0 - 1, 1e-6, 'Jan compounded total');
        }
    }
];

function runTests() {
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
