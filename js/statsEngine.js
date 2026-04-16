// Risk-adjusted performance statistics computed from a TWR series.
// Each TWR entry is { date: Date, twr: cumulative percent (e.g. 23.5 for +23.5%) }.
// All ratios use 252 trading days per year. Daily returns are simple, derived
// from the wealth ratio (1 + twr/100) so they reflect actual day-to-day moves
// rather than raw deltas of cumulative percentages.

const StatsEngine = {
    TRADING_DAYS_PER_YEAR: 252,

    dailyReturns(twrSeries) {
        const returns = [];
        for (let i = 1; i < twrSeries.length; i++) {
            const prev = 1 + twrSeries[i - 1].twr / 100;
            const curr = 1 + twrSeries[i].twr / 100;
            if (prev === 0) {
                returns.push(0);
            } else {
                returns.push(curr / prev - 1);
            }
        }
        return returns;
    },

    mean(arr) {
        if (arr.length === 0) return 0;
        let sum = 0;
        for (const v of arr) sum += v;
        return sum / arr.length;
    },

    // Sample standard deviation (ddof=1 by default — same convention as Excel STDEV).
    std(arr, ddof = 1) {
        if (arr.length <= ddof) return 0;
        const m = this.mean(arr);
        let ss = 0;
        for (const v of arr) ss += (v - m) ** 2;
        return Math.sqrt(ss / (arr.length - ddof));
    },

    annualizedReturn(returns) {
        return this.mean(returns) * this.TRADING_DAYS_PER_YEAR;
    },

    annualizedVolatility(returns) {
        return this.std(returns) * Math.sqrt(this.TRADING_DAYS_PER_YEAR);
    },

    sharpe(returns, riskFreeRate = 0) {
        const annVol = this.annualizedVolatility(returns);
        if (annVol === 0) return null;
        const annRet = this.annualizedReturn(returns);
        return (annRet - riskFreeRate) / annVol;
    },

    // Downside deviation only counts returns below the target (default 0).
    // Squared-mean over ALL observations (Sortino convention), not only the negative ones.
    sortino(returns, riskFreeRate = 0, target = 0) {
        if (returns.length === 0) return null;
        let downsideSqSum = 0;
        for (const r of returns) {
            const d = r - target;
            if (d < 0) downsideSqSum += d * d;
        }
        const downsideStd = Math.sqrt(downsideSqSum / returns.length);
        const annDownsideStd = downsideStd * Math.sqrt(this.TRADING_DAYS_PER_YEAR);
        if (annDownsideStd === 0) return null;
        const annRet = this.annualizedReturn(returns);
        return (annRet - riskFreeRate) / annDownsideStd;
    },

    // Max peak-to-trough drawdown over the wealth path. Returned as positive decimal
    // (e.g. 0.15 = 15% drawdown). Returns 0 for monotonically non-decreasing series.
    maxDrawdown(twrSeries) {
        let peak = -Infinity;
        let maxDD = 0;
        for (const e of twrSeries) {
            const w = 1 + e.twr / 100;
            if (w > peak) peak = w;
            if (peak > 0) {
                const dd = (peak - w) / peak;
                if (dd > maxDD) maxDD = dd;
            }
        }
        return maxDD;
    },

    // CAGR from first to last point of TWR series, using calendar days / 365.25.
    cagr(twrSeries) {
        if (twrSeries.length < 2) return 0;
        const first = twrSeries[0];
        const last = twrSeries[twrSeries.length - 1];
        const wealth = 1 + last.twr / 100;
        const days = (last.date - first.date) / (1000 * 60 * 60 * 24);
        if (days <= 0) return 0;
        const years = days / 365.25;
        if (wealth <= 0) return -1;
        return Math.pow(wealth, 1 / years) - 1;
    },

    // Calmar = CAGR / |max drawdown|. Null if drawdown is zero.
    calmar(twrSeries) {
        const dd = this.maxDrawdown(twrSeries);
        if (dd === 0) return null;
        return this.cagr(twrSeries) / dd;
    },

    // Convenience: all comparison stats in one shot.
    compute(twrSeries, riskFreeRate = 0) {
        const returns = this.dailyReturns(twrSeries);
        return {
            sharpe: this.sharpe(returns, riskFreeRate),
            sortino: this.sortino(returns, riskFreeRate),
            maxDrawdown: this.maxDrawdown(twrSeries),
            calmar: this.calmar(twrSeries)
        };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatsEngine;
}
