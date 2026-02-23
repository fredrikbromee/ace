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

    renderStats(stats, benchmarkStats) {
        document.getElementById('total-value').textContent = Utils.formatCurrency(stats.portfolioValue);
        document.getElementById('annualized-twr').textContent = Utils.formatPercent(stats.annualizedTWR);
        document.getElementById('cagr').textContent = Utils.formatPercent(stats.cagr);
        document.getElementById('cash-balance').textContent = Utils.formatCurrency(stats.cash);
        document.getElementById('txn-costs-total').textContent = Utils.formatCurrency(stats.totalTransactionCosts);
        document.getElementById('net-profit').textContent = Utils.formatCurrency(stats.netProfit);
        
        // Benchmark stats
        if (benchmarkStats) {
            document.getElementById('benchmark-twr').textContent = Utils.formatPercent(benchmarkStats.benchmarkAnnualizedTWR);
            document.getElementById('benchmark-cagr').textContent = Utils.formatPercent(benchmarkStats.benchmarkCAGR);
            const alpha = stats.annualizedTWR - benchmarkStats.benchmarkAnnualizedTWR;
            const alphaEl = document.getElementById('alpha');
            alphaEl.textContent = Utils.formatPercent(alpha);
            alphaEl.classList.remove('positive', 'negative');
            alphaEl.classList.add(alpha >= 0 ? 'positive' : 'negative');
        }
        
        document.getElementById('dashboard').style.display = 'grid';
    },

    renderHoldings(stats) {
        const tbody = document.querySelector('#holdings-table tbody');
        tbody.innerHTML = '';

        const holdings = Object.entries(stats.holdings).filter(([_, qty]) => Math.abs(qty) > 0.0001);
        
        if (holdings.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="4" style="text-align:center">No active positions</td>';
            return;
        }

        holdings.forEach(([stock, qty]) => {
            const row = tbody.insertRow();
            const price = stats.lastPrices[stock] || stats.purchasePrices[stock] || 0;
            const val = qty * price;
            
            row.innerHTML = `
                <td>${stock}</td>
                <td>${qty}</td>
                <td>${Utils.formatCurrency(price)}</td>
                <td>${Utils.formatCurrency(val)}</td>
            `;
        });
    },

    renderCharts(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR) {
        // Chart 1: Portfolio Value (absolute SEK)
        this.renderPortfolioValueChart(portfolioHistory, benchmarkHistory);
        
        // Chart 2: TWR Comparison
        this.renderTWRChart(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR);
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
                        borderWidth: 2
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
                        borderDash: [5, 5]
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
                        borderWidth: 1.5
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

    renderTWRChart(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR) {
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

        let lastBenchmarkTWR = 0;

        portfolioDates.forEach(date => {
            labels.push(date);
            portfolioTWRValues.push(portfolioTWRByDate[date] || 0);
            
            if (benchmarkTWRByDate[date] !== undefined) {
                benchmarkTWRValues.push(benchmarkTWRByDate[date]);
                lastBenchmarkTWR = benchmarkTWRByDate[date];
            } else {
                benchmarkTWRValues.push(lastBenchmarkTWR);
            }
        });

        const ctx = document.getElementById('twrChart').getContext('2d');
        this.twrChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Your Portfolio TWR',
                        data: portfolioTWRValues,
                        borderColor: '#2E86AB',
                        backgroundColor: 'rgba(46, 134, 171, 0.1)',
                        yAxisID: 'y',
                        tension: 0.1,
                        fill: true,
                        borderWidth: 2
                    },
                    {
                        label: 'OMX30 TWR (Buy & Hold)',
                        data: benchmarkTWRValues,
                        borderColor: '#C73E1D',
                        backgroundColor: 'rgba(199, 62, 29, 0.05)',
                        yAxisID: 'y',
                        tension: 0.1,
                        fill: false,
                        borderWidth: 2,
                        borderDash: [5, 5]
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
                                    label += context.parsed.y.toFixed(2) + '%';
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
                            text: 'Time-Weighted Return %',
                            color: '#2E86AB'
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
