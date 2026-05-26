const Dashboard = {
    transactionsGrid: null,
    portfolioValueChart: null,
    twrChart: null,

    // Canonical up/down palette as RGB triples (callers add their own alpha). Mirrors
    // --color-gain / --color-loss in styles.css so heat-map cells, chart bars, and table
    // text all read the same green/red.
    GAIN_RGB: '46, 125, 50',
    LOSS_RGB: '198, 40, 40',

    // OMX30 benchmark line colour. Deliberately a neutral gray, not red: red is reserved
    // page-wide for "loss", so the benchmark recedes as the reference (ground) while the
    // blue portfolio stays the figure.
    BENCHMARK_COLOR: '#6c757d',

    cleanup() {
        if (this.portfolioValueChart) {
            this.portfolioValueChart.destroy();
            this.portfolioValueChart = null;
        }
        if (this.twrChart) {
            this.twrChart.destroy();
            this.twrChart = null;
        }
        if (this.transactionsGrid) {
            this.transactionsGrid.destroy();
            this.transactionsGrid = null;
        }
    },

    renderStats(stats, benchmarkStats, portfolioHistory = [], portfolioTWR = [], benchmarkTWR = []) {
        const setValue = (id, text, cls) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = text; el.className = 'stat-value' + (cls ? ' ' + cls : ''); }
        };
        const setDelta = (id, text, cls) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = text; el.className = 'stat-delta' + (cls ? ' ' + cls : ''); }
        };
        const spark = (id, series, color) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = this._sparkline(series, color);
        };
        const signPct = (v, unit) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + (unit === 'pp' ? ' pp' : '%');
        const signCls = v => v >= 0 ? 'positive' : 'negative';
        const rgb = v => `rgb(${v >= 0 ? this.GAIN_RGB : this.LOSS_RGB})`;

        // Total return since inception = cumulative TWR (neutral to deposit timing, the
        // same measure the rest of the dashboard reports).
        const lastTwr = portfolioTWR.length ? portfolioTWR[portfolioTWR.length - 1].twr : null;
        const lastBench = benchmarkTWR.length ? benchmarkTWR[benchmarkTWR.length - 1].twr : null;
        // Alpha = annualized outperformance vs OMX30 (the headline marketing number).
        const alpha = benchmarkStats ? stats.annualizedTWR - benchmarkStats.benchmarkAnnualizedTWR : null;

        // Headline values: performance first (Total Return, Alpha), tinted by sign.
        setValue('total-return', lastTwr == null ? '—' : signPct(lastTwr, '%'), lastTwr == null ? '' : signCls(lastTwr));
        setValue('alpha-ann', alpha == null ? '—' : signPct(alpha, 'pp') + '/yr', alpha == null ? '' : signCls(alpha));
        setValue('net-profit', Utils.formatCurrency(stats.netProfit), signCls(stats.netProfit));
        setValue('total-value', Utils.formatCurrency(stats.portfolioValue));
        setValue('cash-balance', Utils.formatCurrency(stats.cash));
        setValue('txn-costs-total', Utils.formatCurrency(stats.totalTransactionCosts));

        // Sparklines: trend over the whole period. Alpha shows the cumulative gap to OMX30.
        spark('spark-return', portfolioTWR.map(e => e.twr), rgb(lastTwr ?? 0));
        spark('spark-alpha', this._outperformanceSeries(portfolioTWR, benchmarkTWR), rgb(alpha ?? 0));
        spark('spark-profit', portfolioHistory.map(e => e.pnl), rgb(stats.netProfit));
        spark('spark-value', portfolioHistory.map(e => e.portfolioValue), '#2E86AB');
        spark('spark-cash', portfolioHistory.map(e => e.portfolioValue > 0 ? (e.cash / e.portfolioValue) * 100 : 0), '#F18F01');

        // Deltas: every KPI gets a comparison so none stands context-free.
        if (alpha != null) {
            // Substantiate the alpha with the two annualized figures it's drawn from.
            setDelta('delta-alpha', `${stats.annualizedTWR.toFixed(1)}% vs ${benchmarkStats.benchmarkAnnualizedTWR.toFixed(1)}% ann.`);
        } else {
            setDelta('delta-alpha', '');
        }
        if (stats.totalCapitalIn > 0) {
            const roi = (stats.netProfit / stats.totalCapitalIn) * 100;
            setDelta('delta-profit', signPct(roi, '%') + ' on capital', signCls(roi));
        } else {
            setDelta('delta-profit', '');
        }
        if (lastTwr != null && lastBench != null) {
            const gap = lastTwr - lastBench;
            setDelta('delta-return', signPct(gap, 'pp') + ' vs OMX30', signCls(gap));
        } else {
            setDelta('delta-return', '');
        }
        const cashPct = stats.portfolioValue > 0 ? (stats.cash / stats.portfolioValue) * 100 : 0;
        setDelta('delta-cash', cashPct.toFixed(1) + '% of value'); // neutral ratio, not good/bad
        const costPct = stats.portfolioValue > 0 ? (stats.totalTransactionCosts / stats.portfolioValue) * 100 : 0;
        setDelta('delta-costs', costPct.toFixed(2) + '% of value');
        setDelta('delta-value', ''); // value's story is its sparkline; no single delta fits

        document.getElementById('dashboard').style.display = 'flex';
    },

    // Word-sized SVG sparkline (Tufte): a bare trend line with the last point marked, no
    // axes or labels. `series` is plotted left→right and auto-scaled to its own min/max.
    _sparkline(series, color = '#888') {
        const vals = (series || []).filter(v => v != null && !isNaN(v));
        if (vals.length < 2) return '';
        const w = 84, h = 22, pad = 2.5;
        const min = Math.min(...vals), max = Math.max(...vals);
        const range = (max - min) || 1;
        const stepX = (w - pad * 2) / (vals.length - 1);
        const pts = vals.map((v, i) => {
            const x = pad + i * stepX;
            const y = pad + (h - pad * 2) * (1 - (v - min) / range);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const [lx, ly] = pts[pts.length - 1].split(',');
        return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">`
            + `<polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}" />`
            + `<circle cx="${lx}" cy="${ly}" r="2" fill="${color}" /></svg>`;
    },

    // Cumulative outperformance vs the benchmark, aligned to the portfolio's dates: the
    // portfolio's cumulative TWR minus the benchmark's at the same day (carried forward
    // when the benchmark lacks that day). This is the alpha curve — the widening gap.
    _outperformanceSeries(portfolioTWR, benchmarkTWR) {
        if (!portfolioTWR || !portfolioTWR.length || !benchmarkTWR || !benchmarkTWR.length) return [];
        const benchByDay = {};
        benchmarkTWR.forEach(e => { benchByDay[e.date.toISOString().slice(0, 10)] = e.twr; });
        let lastBench = 0;
        return portfolioTWR.map(e => {
            const k = e.date.toISOString().slice(0, 10);
            if (benchByDay[k] !== undefined) lastBench = benchByDay[k];
            return e.twr - lastBench;
        });
    },

    // Chart.js plugin: label each line directly at its right-hand end in the line's own
    // colour (Tufte direct labelling — no legend round-trip). A line dataset opts in with
    // a `directLabel` name; an optional `directLabelFormat(value)` appends its end value.
    // Labels nudge apart if endpoints nearly coincide. Needs layout.padding.right for room.
    _endLabelPlugin: {
        id: 'endLabels',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart;
            const placed = [];
            chart.data.datasets.forEach((ds, i) => {
                if (!ds.directLabel) return;
                const meta = chart.getDatasetMeta(i);
                if (meta.hidden) return;
                let pt = null, val = null;
                for (let j = ds.data.length - 1; j >= 0; j--) {
                    if (ds.data[j] != null && meta.data[j]) { pt = meta.data[j]; val = ds.data[j]; break; }
                }
                if (!pt) return;
                const valStr = ds.directLabelFormat ? ds.directLabelFormat(val) : '';
                const text = valStr ? `${ds.directLabel} ${valStr}` : ds.directLabel;
                let y = pt.y;
                for (const py of placed) {
                    if (Math.abs(y - py) < 13) y = py + (y >= py ? 13 : -13);
                }
                y = Math.max(chartArea.top + 7, Math.min(chartArea.bottom - 7, y));
                placed.push(y);
                ctx.save();
                ctx.font = '600 11px sans-serif';
                ctx.fillStyle = ds.borderColor;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                ctx.fillText(text, pt.x + 6, y);
                ctx.restore();
            });
        }
    },

    // Provenance line under the title: source, currency, and the date span the data
    // covers (the end date doubles as the "as of" — the most recent day with data).
    renderMeta(portfolioHistory) {
        const el = document.getElementById('dashboard-meta');
        if (!el) return;
        if (!portfolioHistory || !portfolioHistory.length) {
            el.textContent = '';
            return;
        }
        const day = d => d.toISOString().slice(0, 10);
        const first = day(portfolioHistory[0].date);
        const last = day(portfolioHistory[portfolioHistory.length - 1].date);
        el.textContent = `Avanza portfolio · SEK · ${first} → ${last}`;
    },

    renderComparisonTable(stats, benchmarkStats, portfolioTWR, benchmarkTWR) {
        const tbody = document.querySelector('#comparison-table tbody');
        tbody.innerHTML = '';
        if (!benchmarkStats) return;

        const pStats = StatsEngine.compute(portfolioTWR);
        const bStats = StatsEngine.compute(benchmarkTWR);

        const fmtPctAbs = v => v == null ? '—' : v.toFixed(2) + '%';
        const fmtRatio = v => v == null ? '—' : v.toFixed(2);
        const fmtSigned = (d, unit) => d == null ? '—' : (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2) + unit;

        // Advantage of `you` over `bench`, oriented so positive ALWAYS means "better than
        // OMX30" — for lower-is-better metrics (drawdown) that flips to bench − you. One
        // source for both the printed number and its colour, so the sign and the green/red
        // can never disagree (the bug this replaced: a worse drawdown showing "+7 pp").
        const advantage = (you, bench, lowerIsBetter) => {
            if (you == null || bench == null) return null;
            return lowerIsBetter ? bench - you : you - bench;
        };

        const specs = [
            {
                label: 'Annualized TWR', you: stats.annualizedTWR, bench: benchmarkStats.benchmarkAnnualizedTWR,
                kind: 'pct', lowerIsBetter: false,
                help: 'Time-Weighted Return scaled to a full year. Removes the effect of when capital was added or withdrawn — a fair measure of pure strategy performance.'
            },
            {
                label: 'CAGR', you: stats.cagr, bench: benchmarkStats.benchmarkCAGR,
                kind: 'pct', lowerIsBetter: false,
                help: 'Compound Annual Growth Rate — the smooth yearly rate that would carry the starting value to the ending value over the period.'
            },
            {
                label: 'Sharpe', you: pStats.sharpe, bench: bStats.sharpe,
                kind: 'ratio', lowerIsBetter: false,
                help: 'Annualized return divided by annualized volatility (std of daily returns). Higher = more return per unit of total risk. >1 is solid, >2 is strong.'
            },
            {
                label: 'Sortino', you: pStats.sortino, bench: bStats.sortino,
                kind: 'ratio', lowerIsBetter: false,
                help: 'Like Sharpe but penalizes only downside volatility. Rewards strategies that limit losing days while still capturing upside.'
            },
            {
                label: 'Max Drawdown', you: pStats.maxDrawdown * 100, bench: bStats.maxDrawdown * 100,
                kind: 'pct', lowerIsBetter: true,
                help: 'Largest peak-to-trough decline experienced during the period. Lower is better, so the Diff is shown as your advantage: positive means you drew down less than OMX30.'
            },
            {
                label: 'Calmar', you: pStats.calmar, bench: bStats.calmar,
                kind: 'ratio', lowerIsBetter: false,
                help: 'CAGR divided by absolute max drawdown. Measures how much annual return you got per unit of worst loss endured.'
            }
        ];

        const rows = specs.map(s => {
            const fmtVal = s.kind === 'pct' ? fmtPctAbs : fmtRatio;
            const adv = advantage(s.you, s.bench, s.lowerIsBetter);
            return {
                label: s.label,
                you: fmtVal(s.you),
                bench: fmtVal(s.bench),
                diff: fmtSigned(adv, s.kind === 'pct' ? ' pp' : ''),
                diffSign: adv ?? 0,
                help: s.help
            };
        });

        rows.forEach(r => {
            const tr = document.createElement('tr');
            const diffClass = r.diffSign > 0 ? 'positive' : r.diffSign < 0 ? 'negative' : '';
            tr.innerHTML = `
                <td class="metric-col">
                    <details class="metric-help">
                        <summary>${r.label} <span class="info-icon" aria-hidden="true">ⓘ</span></summary>
                        <p>${r.help}</p>
                    </details>
                </td>
                <td class="num-col">${r.you}</td>
                <td class="num-col">${r.bench}</td>
                <td class="num-col ${diffClass}">${r.diff}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    // Default to vs-OMX30: this is a performance pitch, so open on the alpha (green =
    // months that beat the index). Falls back to absolute when no benchmark is present.
    _heatmapMode: 'outperformance',

    // justETF-style returns heat maps. Defaults to the portfolio's own period returns;
    // a toggle switches to outperformance vs OMX30 (the portfolio's return minus the
    // benchmark's, per period, in percentage points).
    renderReturnsHeatmaps(portfolioTWR, benchmarkTWR) {
        this._heatmapTWR = { portfolioTWR, benchmarkTWR };

        const absBtn = document.getElementById('heatmap-mode-abs');
        const vsBtn = document.getElementById('heatmap-mode-vs');
        const hasBench = benchmarkTWR && benchmarkTWR.length >= 2;
        if (vsBtn) {
            vsBtn.disabled = !hasBench;
            vsBtn.onclick = () => this._setHeatmapMode('outperformance');
        }
        if (absBtn) absBtn.onclick = () => this._setHeatmapMode('absolute');

        // Fall back to absolute if a prior session left us in vs-mode with no benchmark.
        if (this._heatmapMode === 'outperformance' && !hasBench) this._heatmapMode = 'absolute';
        this._setHeatmapMode(this._heatmapMode);
    },

    _setHeatmapMode(mode) {
        this._heatmapMode = mode;
        const absBtn = document.getElementById('heatmap-mode-abs');
        const vsBtn = document.getElementById('heatmap-mode-vs');
        if (absBtn) absBtn.classList.toggle('active', mode === 'absolute');
        if (vsBtn) vsBtn.classList.toggle('active', mode === 'outperformance');

        const note = document.getElementById('heatmap-note');
        if (note) {
            note.textContent = mode === 'outperformance'
                ? 'Outperformance vs OMX30, in percentage points — the portfolio’s period return minus the index’s.'
                : 'Period returns from time-weighted return (neutral to deposits & withdrawals), the way a fund’s monthly track record is reported.';
        }

        const monthlyEl = document.getElementById('monthly-heatmap');
        const weeklyEl = document.getElementById('weekly-heatmap');
        if (!monthlyEl || !weeklyEl) return;

        const { portfolioTWR, benchmarkTWR } = this._heatmapTWR || {};
        if (!portfolioTWR || portfolioTWR.length < 2) {
            monthlyEl.innerHTML = '<p class="heatmap-empty">Not enough history yet.</p>';
            weeklyEl.innerHTML = '';
            return;
        }

        const monthlyGrid = HeatmapEngine.monthlyGrid(portfolioTWR, benchmarkTWR, mode);
        const weeklyGrid = HeatmapEngine.weeklyGrid(portfolioTWR, benchmarkTWR, mode);
        // One colour scale across both grids so a given shade means the same return
        // everywhere — weeks reading cooler than months is the honest signal, not a bug.
        const maxAbs = Math.max(this._gridMaxAbs(monthlyGrid), this._gridMaxAbs(weeklyGrid));
        monthlyEl.innerHTML = this._buildMonthlyHeatmap(monthlyGrid, maxAbs);
        weeklyEl.innerHTML = this._buildWeeklyHeatmap(weeklyGrid, maxAbs);
    },

    // Diverging green/red background scaled to the strongest cell across both grids.
    // Intensity is linear in magnitude (colour ∝ value, lie factor ≈ 1); the 0.12 alpha
    // floor keeps small returns visible without inflating them the way a power curve did.
    _heatStyle(ret, maxAbs) {
        if (ret == null || isNaN(ret)) return '';
        const mag = maxAbs > 0 ? Math.min(1, Math.abs(ret) / maxAbs) : 0;
        const alpha = (0.12 + mag * 0.8).toFixed(3);
        const rgb = ret >= 0 ? this.GAIN_RGB : this.LOSS_RGB;
        const fg = mag > 0.55 ? '#fff' : 'inherit';
        return `background-color: rgba(${rgb}, ${alpha}); color: ${fg};`;
    },

    // Largest |cell value| in a grid, ignoring totals (totals render neutral). Works for
    // both the monthly grid ({ years, byYearMonth }) and the weekly grid ({ rows[].weeks }).
    _gridMaxAbs(grid) {
        let max = 0;
        if (grid.years) {
            grid.years.forEach(y => {
                for (let m = 0; m < 12; m++) {
                    const p = grid.byYearMonth[y][m];
                    if (p && p.value != null) max = Math.max(max, Math.abs(p.value));
                }
            });
        }
        if (grid.rows) {
            grid.rows.forEach(r => r.weeks.forEach(p => {
                if (p && p.value != null) max = Math.max(max, Math.abs(p.value));
            }));
        }
        return max;
    },

    // Year/month totals render with no heat fill: a total is a different quantity than a
    // period cell, so colouring it on the cell scale either saturated (long runs of gains)
    // or invited a false comparison. The bold signed number carries it; a sign-only tint
    // (CSS .pos/.neg) keeps up/down legible without encoding magnitude.
    _totalCell(v, tooltip) {
        if (v == null || isNaN(v)) return '<td class="heat-cell total-cell"></td>';
        const cls = v > 0 ? ' pos' : v < 0 ? ' neg' : '';
        return `<td class="heat-cell total-cell${cls}" title="${tooltip}">${this._fmtCell(v)}</td>`;
    },

    // Full value with unit, used in tooltips. unit '%' for returns, ' pp' for outperformance.
    _fmtVal(v, unit) {
        if (v == null || isNaN(v)) return '';
        const x = v * 100;
        const sign = x > 0 ? '+' : x < 0 ? '−' : '';
        return `${sign}${Math.abs(x).toFixed(1)}${unit === 'pp' ? ' pp' : '%'}`;
    },

    // Compact cell text — no unit so the grid fits in mobile portrait. The full
    // value (with unit) still shows in the cell's tooltip.
    _fmtCell(v) {
        if (v == null || isNaN(v)) return '';
        const x = v * 100;
        const sign = x > 0 ? '+' : x < 0 ? '−' : '';
        return `${sign}${Math.abs(x).toFixed(1)}`;
    },

    _cell(cell, maxAbs, tooltip) {
        if (!cell || cell.value == null || isNaN(cell.value)) return '<td class="heat-cell"></td>';
        return `<td class="heat-cell" style="${this._heatStyle(cell.value, maxAbs)}" title="${tooltip}">${this._fmtCell(cell.value)}</td>`;
    },

    _isoDay(date) {
        return date.toISOString().slice(0, 10);
    },

    _buildMonthlyHeatmap(grid, maxAbs) {
        if (!grid.years.length) return '<p class="heatmap-empty">No monthly data.</p>';

        const unit = grid.unit;
        const vs = unit === 'pp' ? ' vs OMX30' : '';

        const head = ['Year', ...HeatmapEngine.MONTHS, 'Total']
            .map((h, i) => `<th${i === 0 ? ' class="row-head"' : ''}${i === 13 ? ' class="total-head"' : ''}>${h}</th>`)
            .join('');

        const rows = grid.years.map(year => {
            const cells = [];
            for (let m = 0; m < 12; m++) {
                const p = grid.byYearMonth[year][m];
                const tip = (p && p.value != null) ? `${HeatmapEngine.MONTHS[m]} ${year}: ${this._fmtVal(p.value, unit)}${vs}` : '';
                cells.push(this._cell(p, maxAbs, tip));
            }
            const total = grid.yearTotals[year];
            const totalCell = this._totalCell(total, `${year} total: ${this._fmtVal(total, unit)}${vs}`);
            return `<tr><th class="row-head">'${String(year).slice(2)}</th>${cells.join('')}${totalCell}</tr>`;
        }).join('');

        return `<table class="heatmap-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    },

    _buildWeeklyHeatmap(grid, maxAbs) {
        if (!grid.rows.length) return '<p class="heatmap-empty">No weekly data.</p>';

        const unit = grid.unit;
        const vs = unit === 'pp' ? ' vs OMX30' : '';

        const colHeads = [];
        for (let c = 0; c < grid.maxCols; c++) colHeads.push(`<th>W${c + 1}</th>`);
        const head = `<th class="row-head">Month</th>${colHeads.join('')}<th class="total-head">Total</th>`;

        const rows = grid.rows.map(row => {
            const [y, m] = row.monthKey.split('-');
            const label = `${HeatmapEngine.MONTHS[+m - 1]} '${y.slice(2)}`;
            const cells = [];
            for (let c = 0; c < grid.maxCols; c++) {
                const p = row.weeks[c];
                const tip = (p && p.value != null) ? `${this._isoDay(p.startDate)} → ${this._isoDay(p.endDate)}: ${this._fmtVal(p.value, unit)}${vs}` : '';
                cells.push(this._cell(p, maxAbs, tip));
            }
            const totalCell = this._totalCell(row.total, `${label} total: ${this._fmtVal(row.total, unit)}${vs}`);
            return `<tr><th class="row-head">${label}</th>${cells.join('')}${totalCell}</tr>`;
        }).join('');

        return `<table class="heatmap-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    },

    renderHoldings(stats) {
        const tbody = document.querySelector('#holdings-table tbody');
        tbody.innerHTML = '';

        const holdings = Object.entries(stats.holdings).filter(([_, qty]) => Math.abs(qty) > 0.0001);
        
        if (holdings.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="6" style="text-align:center">No active positions</td>';
            return;
        }

        let totalNav = 0;
        let totalUnrealized = 0;

        holdings.forEach(([stock, qty]) => {
            const row = tbody.insertRow();
            const marketPrice = stats.lastPrices[stock] || stats.purchasePrices[stock] || 0;
            const avgPrice = stats.avgPrices[stock] || 0;
            const nav = qty * marketPrice;
            const unrealized = qty * (marketPrice - avgPrice);
            totalNav += nav;
            totalUnrealized += unrealized;
            const pnlClass = unrealized >= 0 ? 'positive' : 'negative';

            row.innerHTML = `
                <td>${stock}</td>
                <td>${qty}</td>
                <td>${Utils.formatCurrency(avgPrice)}</td>
                <td>${Utils.formatCurrency(marketPrice)}</td>
                <td>${Utils.formatCurrency(nav)}</td>
                <td class="${pnlClass}">${Utils.formatCurrency(unrealized)}</td>
            `;
        });

        const footerRow = tbody.insertRow();
        const pnlClass = totalUnrealized >= 0 ? 'positive' : 'negative';
        footerRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td><strong>${Utils.formatCurrency(totalNav)}</strong></td>
            <td class="${pnlClass}"><strong>${Utils.formatCurrency(totalUnrealized)}</strong></td>
        `;
    },

    renderCharts(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR, annotations = []) {
        // Chart 1: Portfolio Value (absolute SEK)
        this.renderPortfolioValueChart(portfolioHistory, benchmarkHistory);

        // Chart 2: TWR Comparison + daily outperformance bars + annotations
        this.renderTWRChart(portfolioTWR, benchmarkTWR, annotations);
    },

    renderPortfolioValueChart(portfolioHistory, benchmarkHistory) {
        // Build daily data maps
        const portfolioByDate = {};
        portfolioHistory.forEach(entry => {
            const dateKey = entry.date.toISOString().split('T')[0];
            portfolioByDate[dateKey] = entry;
        });

        const benchmarkByDate = {};
        benchmarkHistory.forEach(entry => {
            const dateKey = entry.date.toISOString().split('T')[0];
            benchmarkByDate[dateKey] = entry;
        });

        const portfolioDates = Object.keys(portfolioByDate).sort();

        // Build chart data - absolute values in SEK
        const labels = [];
        const portfolioValues = [];
        const benchmarkValues = [];
        const cashPct = []; // cash as % of total portfolio value (cash is a slice of it)

        let lastBenchmarkValue = 0;

        portfolioDates.forEach(date => {
            const pEntry = portfolioByDate[date];
            const bEntry = benchmarkByDate[date];

            labels.push(date);
            portfolioValues.push(pEntry.portfolioValue);
            cashPct.push(pEntry.portfolioValue > 0 ? (pEntry.cash / pEntry.portfolioValue) * 100 : 0);

            if (bEntry) {
                benchmarkValues.push(bEntry.benchmarkValue);
                lastBenchmarkValue = bEntry.benchmarkValue;
            } else {
                benchmarkValues.push(lastBenchmarkValue);
            }
        });

        const ctx = document.getElementById('portfolioValueChart').getContext('2d');
        this.portfolioValueChart = new Chart(ctx, {
            type: 'line',
            plugins: [this._endLabelPlugin],
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Portfolio Value (SEK)',
                        directLabel: 'Portfolio',
                        data: portfolioValues,
                        borderColor: '#2E86AB',
                        yAxisID: 'y',
                        tension: 0,
                        fill: false,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'OMX30 Value (SEK)',
                        directLabel: 'OMX30',
                        data: benchmarkValues,
                        borderColor: this.BENCHMARK_COLOR,
                        yAxisID: 'y',
                        tension: 0,
                        fill: false,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Cash (% of value)',
                        directLabel: 'Cash',
                        directLabelFormat: v => v.toFixed(0) + '%',
                        data: cashPct,
                        borderColor: '#F18F01',
                        yAxisID: 'y1',
                        borderDash: [3, 3],
                        tension: 0,
                        fill: false,
                        borderWidth: 1.5,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Room on the right for the direct end-of-line labels ("Portfolio").
                layout: { padding: { right: 58 } },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.dataset.yAxisID === 'y1'
                                        ? context.parsed.y.toFixed(1) + '%'
                                        : new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    },
                    legend: {
                        // Lines are labelled directly at their ends — no legend needed.
                        display: false
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 10,
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Value (SEK)',
                            color: '#2E86AB'
                        }
                    },
                    y1: {
                        // Hidden axis: the cash line is still positioned on its own 0–100
                        // scale, but it reads via its direct end label ("Cash N%") rather
                        // than a second visible axis — declutters and frees the right margin.
                        type: 'linear',
                        display: false,
                        position: 'right',
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    },

    renderTWRChart(portfolioTWR, benchmarkTWR, annotations = []) {
        // Build TWR data maps
        const portfolioTWRByDate = {};
        portfolioTWR.forEach(entry => {
            const dateKey = entry.date.toISOString().split('T')[0];
            portfolioTWRByDate[dateKey] = entry.twr;
        });

        const benchmarkTWRByDate = {};
        benchmarkTWR.forEach(entry => {
            const dateKey = entry.date.toISOString().split('T')[0];
            benchmarkTWRByDate[dateKey] = entry.twr;
        });

        // Use portfolio dates as x-axis
        const portfolioDates = Object.keys(portfolioTWRByDate).sort();

        const labels = [];
        const portfolioTWRValues = [];
        const benchmarkTWRValues = [];
        const dailyDeltas = [];
        const barColors = [];

        let lastBenchmarkTWR = 0;
        let prevPortfolioTWR = null;
        let prevBenchmarkTWR = null;

        portfolioDates.forEach(date => {
            const pTWR = portfolioTWRByDate[date] || 0;
            if (benchmarkTWRByDate[date] !== undefined) {
                lastBenchmarkTWR = benchmarkTWRByDate[date];
            }

            labels.push(date);
            portfolioTWRValues.push(pTWR);
            benchmarkTWRValues.push(lastBenchmarkTWR);

            // Daily outperformance: portfolio's daily return − benchmark's daily return
            if (prevPortfolioTWR === null) {
                dailyDeltas.push(null);
                barColors.push('rgba(0,0,0,0)');
            } else {
                const delta = (pTWR - prevPortfolioTWR) - (lastBenchmarkTWR - prevBenchmarkTWR);
                dailyDeltas.push(delta);
                barColors.push(delta >= 0 ? `rgba(${this.GAIN_RGB}, 0.75)` : `rgba(${this.LOSS_RGB}, 0.75)`);
            }

            prevPortfolioTWR = pTWR;
            prevBenchmarkTWR = lastBenchmarkTWR;
        });

        // Single shared scale. Lines (cumulative %) dominate the range; bars (daily pp)
        // are small. yMin sits just below zero so the zero line sits near the bottom and
        // negative bars/lines stay visible.
        const validDeltas = dailyDeltas.filter(v => v !== null);
        const allValues = [...portfolioTWRValues, ...benchmarkTWRValues, ...validDeltas];
        const dataMax = Math.max(0, ...allValues);
        const dataMin = Math.min(0, ...allValues);
        const yMax = dataMax * 1.05;
        const yMin = Math.min(dataMin, -2); // small breathing room below zero

        const fmtPct = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';

        const ctx = document.getElementById('twrChart').getContext('2d');
        this.twrChart = new Chart(ctx, {
            plugins: [this._endLabelPlugin],
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Portfolio TWR',
                        directLabel: 'Portfolio',
                        directLabelFormat: fmtPct,
                        data: portfolioTWRValues,
                        borderColor: '#2E86AB',
                        backgroundColor: 'rgba(46, 134, 171, 0.1)',
                        yAxisID: 'y',
                        tension: 0,
                        fill: false,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        order: 1
                    },
                    {
                        type: 'line',
                        label: 'OMX30 TWR (Buy & Hold)',
                        directLabel: 'OMX30',
                        directLabelFormat: fmtPct,
                        data: benchmarkTWRValues,
                        borderColor: this.BENCHMARK_COLOR,
                        yAxisID: 'y',
                        tension: 0,
                        fill: false,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        order: 1
                    },
                    {
                        type: 'bar',
                        label: 'Daily outperformance (pp)',
                        data: dailyDeltas,
                        backgroundColor: barColors,
                        borderWidth: 0,
                        yAxisID: 'y',
                        barPercentage: 1.0,
                        categoryPercentage: 1.0,
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Room on the right for the direct end-of-line labels ("Portfolio +24.1%").
                layout: { padding: { right: 88 } },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                onClick: annotations && annotations.length
                    ? (event) => this._onTwrChartClick(event)
                    : undefined,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const v = context.parsed.y;
                                if (v === null) return '';
                                if (context.dataset.type === 'bar') {
                                    const sign = v >= 0 ? '+' : '';
                                    return `${label}: ${sign}${v.toFixed(3)} pp`;
                                }
                                return `${label}: ${v.toFixed(2)}%`;
                            }
                        }
                    },
                    legend: {
                        // Both lines are labelled directly at their ends and the bars are
                        // explained by the caption under the heading — no legend needed.
                        display: false
                    },
                    annotation: {
                        annotations: this._buildChartAnnotations(annotations, labels)
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 10,
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: yMin,
                        max: yMax,
                        title: {
                            display: true,
                            text: 'TWR % / Daily pp'
                        },
                        grid: {
                            color: function(ctx) {
                                return ctx.tick.value === 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)';
                            },
                            lineWidth: function(ctx) {
                                return ctx.tick.value === 0 ? 1.5 : 1;
                            }
                        }
                    }
                }
            }
        });
    },

    // Annotation hit map populated by _buildChartAnnotations: { num, chartDate, annotation }
    _chartAnnotations: [],
    _activeAnnotation: null,

    // Build a Chart.js annotation-plugin config from annotation rows.
    // Each annotation becomes an always-visible dashed vertical line with a numbered badge.
    // Annotation date is snapped to the nearest trading day on or after it; annotations
    // beyond the chart's date range are skipped silently. Per-annotation click handlers
    // are not used — the chart-wide onClick does hit-testing on x-pixel positions so we
    // can also detect "click on empty area" to dismiss.
    _buildChartAnnotations(annotations, chartLabels) {
        this._chartAnnotations = [];
        if (!annotations || !annotations.length || !chartLabels.length) return {};
        const labelSet = new Set(chartLabels);
        const lastLabel = chartLabels[chartLabels.length - 1];
        const config = {};

        annotations.forEach((a, idx) => {
            const num = idx + 1;
            let chartDate = a.date;
            if (!labelSet.has(chartDate)) {
                chartDate = chartLabels.find(l => l >= a.date);
                if (!chartDate || a.date > lastLabel) return;
            }
            this._chartAnnotations.push({ num, chartDate, annotation: a });
            config[`ann_${num}`] = {
                type: 'line',
                xMin: chartDate,
                xMax: chartDate,
                borderColor: 'rgba(120, 81, 169, 0.7)',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: {
                    content: String(num),
                    display: true,
                    position: 'start',
                    backgroundColor: 'rgba(120, 81, 169, 0.95)',
                    color: '#fff',
                    font: { size: 11, weight: 'bold' },
                    padding: { top: 2, bottom: 2, left: 7, right: 7 },
                    borderRadius: 10
                }
            };
        });
        return config;
    },

    // Hit-test a chart click against the rendered annotation x-positions.
    // Returns the matching annotation entry or null for empty-area clicks.
    _hitTestAnnotation(event) {
        if (!this.twrChart || !this._chartAnnotations.length) return null;
        const xScale = this.twrChart.scales.x;
        if (!xScale) return null;
        const TOLERANCE_PX = 12;
        for (const entry of this._chartAnnotations) {
            const annX = xScale.getPixelForValue(entry.chartDate);
            if (annX != null && Math.abs(event.x - annX) <= TOLERANCE_PX) {
                return entry;
            }
        }
        return null;
    },

    _onTwrChartClick(event) {
        const hit = this._hitTestAnnotation(event);
        if (!hit) {
            this._hideAnnotationText();
            return;
        }
        if (this._activeAnnotation === hit.num) {
            this._hideAnnotationText();
        } else {
            this._showAnnotationText(hit);
        }
    },

    _showAnnotationText(entry) {
        const panel = document.getElementById('annotation-detail');
        if (!panel) return;
        panel.querySelector('.annotation-num').textContent = entry.num;
        panel.querySelector('.annotation-date').textContent = entry.annotation.date;
        panel.querySelector('.annotation-title').textContent = entry.annotation.title;
        panel.querySelector('.annotation-description').textContent = entry.annotation.description;
        panel.hidden = false;
        this._activeAnnotation = entry.num;
    },

    _hideAnnotationText() {
        const panel = document.getElementById('annotation-detail');
        if (panel) panel.hidden = true;
        this._activeAnnotation = null;
    },

    // Annotation rendering is fully driven by the chart now (markers always visible);
    // this just resets the detail panel so a new dataset doesn't carry stale state.
    renderAnnotations() {
        this._hideAnnotationText();
    },

    renderTransactions(historyEvents) {
        const container = document.getElementById('transactions-grid-container');
        const sortedEvents = [...historyEvents].reverse();
        
        const gridData = sortedEvents.map(event => {
            const dateStr = event.date.toISOString().slice(0, 10);
            if (event.type === 'Dividend') {
                return {
                    date: dateStr,
                    action: event.action,
                    stock: event.stock,
                    quantity: event.quantity,
                    price: event.price,
                    totalValue: event.totalValue,
                    feeDisplay: '',
                    pnl: event.totalValue
                };
            }

            if (event.type === 'Trade') {
                const totalValAbs = Math.abs(event.totalValue);
                const expectedVal = Math.abs(event.quantity) * event.price;
                let fee = Math.abs(totalValAbs - expectedVal);
                let feePct = 0;
                if (expectedVal > 0) feePct = (fee / expectedVal) * 100;

                let feeDisplay = Utils.formatCurrency(fee);
                if (feePct > 0) feeDisplay += ` (${feePct.toFixed(2)}%)`;

                return {
                    date: dateStr,
                    action: event.action,
                    stock: event.stock,
                    quantity: event.quantity,
                    price: event.price,
                    totalValue: event.totalValue,
                    feeDisplay: feeDisplay,
                    pnl: event.realizedPnL
                };
            }

            if (event.type === 'Withdrawal') {
                return {
                    date: dateStr,
                    action: event.action,
                    stock: '',
                    quantity: '',
                    price: null,
                    totalValue: event.totalValue,
                    feeDisplay: '',
                    pnl: null
                };
            }

            return null;
        }).filter(Boolean);

        if (this.transactionsGrid) {
            this.transactionsGrid.destroy();
        }

        this.transactionsGrid = new gridjs.Grid({
            columns: [
                'Date',
                'Action',
                'Stock',
                'Qty',
                'Price',
                'Value',
                'Fee',
                {
                    // Colour P&L green/red on the shared scheme (same as the holdings
                    // table); cell holds the raw number so the formatter can read its sign.
                    name: 'P&L',
                    formatter: cell => {
                        if (cell === null || cell === undefined || cell === '') return '';
                        const cls = cell >= 0 ? 'positive' : 'negative';
                        return gridjs.html(`<span class="${cls}">${Utils.formatCurrency(cell)}</span>`);
                    }
                }
            ],
            data: gridData.map(row => [
                row.date,
                row.action,
                row.stock,
                row.quantity,
                row.price ? Utils.formatCurrency(row.price) : '',
                Utils.formatCurrency(row.totalValue),
                row.feeDisplay || '',
                row.pnl !== null && row.pnl !== undefined ? row.pnl : ''
            ]),
            search: true,
            sort: false,
            resizable: false,
            autoWidth: false,
            fixedHeader: true,
            style: {
                table: {
                    width: '100%'
                }
            }
        });

        this.transactionsGrid.render(container);
    }
};
