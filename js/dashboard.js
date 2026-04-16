const Dashboard = {
    transactionsGrid: null,
    portfolioValueChart: null,
    twrChart: null,

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

    renderStats(stats) {
        document.getElementById('total-value').textContent = Utils.formatCurrency(stats.portfolioValue);
        document.getElementById('cash-balance').textContent = Utils.formatCurrency(stats.cash);
        document.getElementById('txn-costs-total').textContent = Utils.formatCurrency(stats.totalTransactionCosts);
        document.getElementById('net-profit').textContent = Utils.formatCurrency(stats.netProfit);
        document.getElementById('dashboard').style.display = 'grid';
    },

    renderComparisonTable(stats, benchmarkStats, portfolioTWR, benchmarkTWR) {
        const tbody = document.querySelector('#comparison-table tbody');
        tbody.innerHTML = '';
        if (!benchmarkStats) return;

        const pStats = StatsEngine.compute(portfolioTWR);
        const bStats = StatsEngine.compute(benchmarkTWR);

        const fmtPctAbs = v => v == null ? '—' : v.toFixed(2) + '%';
        const fmtRatio = v => v == null ? '—' : v.toFixed(2);
        const fmtDiffPp = (a, b) => {
            if (a == null || b == null) return '—';
            const d = a - b;
            return (d >= 0 ? '+' : '') + d.toFixed(2) + ' pp';
        };
        const fmtDiffRatio = (a, b) => {
            if (a == null || b == null) return '—';
            const d = a - b;
            return (d >= 0 ? '+' : '') + d.toFixed(2);
        };

        const rows = [
            {
                label: 'Annualized TWR',
                you: fmtPctAbs(stats.annualizedTWR),
                bench: fmtPctAbs(benchmarkStats.benchmarkAnnualizedTWR),
                diff: fmtDiffPp(stats.annualizedTWR, benchmarkStats.benchmarkAnnualizedTWR),
                diffSign: stats.annualizedTWR - benchmarkStats.benchmarkAnnualizedTWR,
                lowerIsBetter: false,
                help: 'Time-Weighted Return scaled to a full year. Removes the effect of when capital was added or withdrawn — a fair measure of pure strategy performance.'
            },
            {
                label: 'CAGR',
                you: fmtPctAbs(stats.cagr),
                bench: fmtPctAbs(benchmarkStats.benchmarkCAGR),
                diff: fmtDiffPp(stats.cagr, benchmarkStats.benchmarkCAGR),
                diffSign: stats.cagr - benchmarkStats.benchmarkCAGR,
                lowerIsBetter: false,
                help: 'Compound Annual Growth Rate — the smooth yearly rate that would carry the starting value to the ending value over the period.'
            },
            {
                label: 'Sharpe',
                you: fmtRatio(pStats.sharpe),
                bench: fmtRatio(bStats.sharpe),
                diff: fmtDiffRatio(pStats.sharpe, bStats.sharpe),
                diffSign: (pStats.sharpe ?? 0) - (bStats.sharpe ?? 0),
                lowerIsBetter: false,
                help: 'Annualized return divided by annualized volatility (std of daily returns). Higher = more return per unit of total risk. >1 is solid, >2 is strong.'
            },
            {
                label: 'Sortino',
                you: fmtRatio(pStats.sortino),
                bench: fmtRatio(bStats.sortino),
                diff: fmtDiffRatio(pStats.sortino, bStats.sortino),
                diffSign: (pStats.sortino ?? 0) - (bStats.sortino ?? 0),
                lowerIsBetter: false,
                help: 'Like Sharpe but penalizes only downside volatility. Rewards strategies that limit losing days while still capturing upside.'
            },
            {
                label: 'Max Drawdown',
                you: fmtPctAbs(pStats.maxDrawdown * 100),
                bench: fmtPctAbs(bStats.maxDrawdown * 100),
                diff: fmtDiffPp(pStats.maxDrawdown * 100, bStats.maxDrawdown * 100),
                diffSign: -(pStats.maxDrawdown - bStats.maxDrawdown), // less drawdown = better
                lowerIsBetter: true,
                help: 'Largest peak-to-trough decline experienced during the period. Lower (less negative) is better.'
            },
            {
                label: 'Calmar',
                you: fmtRatio(pStats.calmar),
                bench: fmtRatio(bStats.calmar),
                diff: fmtDiffRatio(pStats.calmar, bStats.calmar),
                diffSign: (pStats.calmar ?? 0) - (bStats.calmar ?? 0),
                lowerIsBetter: false,
                help: 'CAGR divided by absolute max drawdown. Measures how much annual return you got per unit of worst loss endured.'
            }
        ];

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

    renderCharts(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR) {
        // Chart 1: Portfolio Value (absolute SEK)
        this.renderPortfolioValueChart(portfolioHistory, benchmarkHistory);

        // Chart 2: TWR Comparison + daily outperformance bars
        this.renderTWRChart(portfolioTWR, benchmarkTWR);
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
        const cashBalances = [];

        let lastBenchmarkValue = 0;

        portfolioDates.forEach(date => {
            const pEntry = portfolioByDate[date];
            const bEntry = benchmarkByDate[date];
            
            labels.push(date);
            portfolioValues.push(pEntry.portfolioValue);
            cashBalances.push(pEntry.cash);
            
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
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Your Portfolio Value (SEK)',
                        data: portfolioValues,
                        borderColor: '#2E86AB',
                        backgroundColor: 'rgba(46, 134, 171, 0.1)',
                        yAxisID: 'y',
                        tension: 0.1,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'OMX30 Value (SEK)',
                        data: benchmarkValues,
                        borderColor: '#C73E1D',
                        backgroundColor: 'rgba(199, 62, 29, 0.05)',
                        yAxisID: 'y',
                        tension: 0.1,
                        fill: false,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Cash Balance (SEK)',
                        data: cashBalances,
                        borderColor: '#F18F01',
                        backgroundColor: 'rgba(241, 143, 1, 0.1)',
                        yAxisID: 'y1',
                        borderDash: [3, 3],
                        tension: 0.1,
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
                                    label += new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    },
                    legend: {
                        position: 'top',
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
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: {
                            drawOnChartArea: false,
                        },
                        title: {
                            display: true,
                            text: 'Cash (SEK)',
                            color: '#F18F01'
                        }
                    }
                }
            }
        });
    },

    renderTWRChart(portfolioTWR, benchmarkTWR) {
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
                barColors.push(delta >= 0 ? 'rgba(76, 175, 80, 0.75)' : 'rgba(244, 67, 54, 0.75)');
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

        const ctx = document.getElementById('twrChart').getContext('2d');
        this.twrChart = new Chart(ctx, {
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'Your Portfolio TWR',
                        data: portfolioTWRValues,
                        borderColor: '#2E86AB',
                        backgroundColor: 'rgba(46, 134, 171, 0.1)',
                        yAxisID: 'y',
                        tension: 0.1,
                        fill: false,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        order: 1
                    },
                    {
                        type: 'line',
                        label: 'OMX30 TWR (Buy & Hold)',
                        data: benchmarkTWRValues,
                        borderColor: '#C73E1D',
                        backgroundColor: 'rgba(199, 62, 29, 0.05)',
                        yAxisID: 'y',
                        tension: 0.1,
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
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
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
                        position: 'top',
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
                'P&L'
            ],
            data: gridData.map(row => [
                row.date,
                row.action,
                row.stock,
                row.quantity,
                row.price ? Utils.formatCurrency(row.price) : '',
                Utils.formatCurrency(row.totalValue),
                row.feeDisplay || '',
                row.pnl !== null && row.pnl !== undefined ? Utils.formatCurrency(row.pnl) : ''
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
