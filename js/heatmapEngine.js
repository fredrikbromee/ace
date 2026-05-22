// Period-return heat maps, justETF style.
//
// Input is a TWR series — the same { date: Date, twr: cumulative percent } array
// produced by PortfolioEngine.calculateTWR(). Because TWR strips out the timing of
// deposits/withdrawals, the per-period returns derived here behave like a fund's
// published monthly track record (which is exactly what justETF's heat map shows).
//
// Wealth for an entry is (1 + twr/100). A period's return is the wealth ratio between
// the end of the previous period and the end of this one, so chaining (1 + r) across
// all periods reproduces the cumulative TWR. The very first period is measured from the
// series' starting wealth (twr 0 ⇒ wealth 1), i.e. "return since inception".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HeatmapEngine = {
    MONTHS,

    // "YYYY-MM" key in UTC (the rest of the app keys days off toISOString()).
    monthKey(date) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    },

    // ISO-8601 week parts for a date: the week's number, its ISO week-year, and the
    // Thursday that anchors it (a week belongs to the year/month containing its Thursday).
    isoWeekParts(date) {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
        d.setUTCDate(d.getUTCDate() - dayNum + 3); // jump to this week's Thursday
        const thursday = new Date(d.getTime());
        const isoYear = thursday.getUTCFullYear();
        const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
        const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
        firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
        const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
        return { isoYear, week, thursday };
    },

    isoWeekKey(date) {
        const { isoYear, week } = this.isoWeekParts(date);
        return `${isoYear}-W${String(week).padStart(2, '0')}`;
    },

    // Group the daily series by keyOf(date) and chain one return per group.
    // Returns ordered [{ key, startDate, endDate, return }] with return as a decimal.
    periodReturns(twrSeries, keyOf) {
        if (!twrSeries || twrSeries.length === 0) return [];
        const wealth = e => 1 + e.twr / 100;

        const order = [];
        const byKey = new Map();
        for (const e of twrSeries) {
            const key = keyOf(e.date);
            let g = byKey.get(key);
            if (!g) {
                g = { key, entries: [] };
                byKey.set(key, g);
                order.push(g);
            }
            g.entries.push(e);
        }

        const out = [];
        let prevEndWealth = wealth(twrSeries[0]); // inception wealth (≈ 1.0)
        for (const g of order) {
            const start = g.entries[0];
            const end = g.entries[g.entries.length - 1];
            const endWealth = wealth(end);
            const ret = prevEndWealth !== 0 ? endWealth / prevEndWealth - 1 : 0;
            out.push({ key: g.key, startDate: start.date, endDate: end.date, return: ret });
            prevEndWealth = endWealth;
        }
        return out;
    },

    // Compound a list of period objects into a single return (decimal).
    compound(periods) {
        let w = 1;
        for (const p of periods) w *= (1 + p.return);
        return w - 1;
    },

    // key -> period return (decimal), for matching one series against another.
    periodReturnMap(twrSeries, keyOf) {
        const m = new Map();
        for (const p of this.periodReturns(twrSeries, keyOf)) m.set(p.key, p.return);
        return m;
    },

    // Whether a benchmark comparison is requested and possible.
    _outperformance(benchmarkTWR, mode) {
        return mode === 'outperformance' && benchmarkTWR && benchmarkTWR.length >= 2;
    },

    // The number each cell shows. In 'absolute' mode it's the period return; in
    // 'outperformance' mode it's the portfolio return minus the benchmark's for the
    // same period (a percentage-point gap), or null when the benchmark lacks that period.
    _cellValue(period, outperf, benchMap) {
        if (!outperf) return period.return;
        return benchMap.has(period.key) ? period.return - benchMap.get(period.key) : null;
    },

    // Monthly grid: rows = year, columns = month 0..11, plus per-year totals.
    // Each cell is { ...period, value }. Pass a benchmark series + mode='outperformance'
    // to show the gap vs the benchmark instead of the raw return.
    // { years, byYearMonth: { year: { month: cell } }, yearTotals: { year }, unit, mode }
    monthlyGrid(twrSeries, benchmarkTWR = null, mode = 'absolute') {
        const outperf = this._outperformance(benchmarkTWR, mode);
        const periods = this.periodReturns(twrSeries, d => this.monthKey(d));
        const benchMap = outperf ? this.periodReturnMap(benchmarkTWR, d => this.monthKey(d)) : null;
        const benchYearTotals = outperf ? this.monthlyGrid(benchmarkTWR).yearTotals : null;

        const byYearMonth = {};
        const years = [];
        for (const p of periods) {
            const [y, m] = p.key.split('-');
            const year = +y;
            const month = +m - 1;
            if (!byYearMonth[year]) {
                byYearMonth[year] = {};
                years.push(year);
            }
            byYearMonth[year][month] = { ...p, value: this._cellValue(p, outperf, benchMap) };
        }
        years.sort((a, b) => a - b);

        const yearTotals = {};
        for (const year of years) {
            const months = Object.keys(byYearMonth[year]).map(m => byYearMonth[year][m]);
            const total = this.compound(months);
            yearTotals[year] = outperf ? total - (benchYearTotals[year] ?? 0) : total;
        }
        return { years, byYearMonth, yearTotals, unit: outperf ? 'pp' : '%', mode: outperf ? 'outperformance' : 'absolute' };
    },

    // Weekly grid: rows = month (ISO week assigned by its Thursday), columns = the weeks
    // falling in that month in order, plus per-month totals. Cells carry a `value` and the
    // grid an `unit`, same outperformance semantics as monthlyGrid.
    // { rows: [{ monthKey, weeks: [cell], total }], maxCols, unit, mode }
    weeklyGrid(twrSeries, benchmarkTWR = null, mode = 'absolute') {
        const outperf = this._outperformance(benchmarkTWR, mode);
        const periods = this.periodReturns(twrSeries, d => this.isoWeekKey(d));
        const benchMap = outperf ? this.periodReturnMap(benchmarkTWR, d => this.isoWeekKey(d)) : null;
        let benchRowTotals = null;
        if (outperf) {
            benchRowTotals = new Map();
            for (const r of this.weeklyGrid(benchmarkTWR).rows) benchRowTotals.set(r.monthKey, r.total);
        }

        const order = [];
        const byMonth = new Map();
        for (const p of periods) {
            const thursday = this.isoWeekParts(p.startDate).thursday;
            const mk = this.monthKey(thursday);
            let row = byMonth.get(mk);
            if (!row) {
                row = { monthKey: mk, weeks: [] };
                byMonth.set(mk, row);
                order.push(row);
            }
            row.weeks.push({ ...p, value: this._cellValue(p, outperf, benchMap) });
        }

        order.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        let maxCols = 0;
        for (const row of order) {
            row.weeks.sort((a, b) => a.startDate - b.startDate);
            const total = this.compound(row.weeks);
            row.total = outperf ? total - (benchRowTotals.get(row.monthKey) ?? 0) : total;
            if (row.weeks.length > maxCols) maxCols = row.weeks.length;
        }
        return { rows: order, maxCols, unit: outperf ? 'pp' : '%', mode: outperf ? 'outperformance' : 'absolute' };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeatmapEngine;
}
