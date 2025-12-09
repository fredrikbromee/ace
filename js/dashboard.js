// --- UI / Dashboard ---
const Dashboard = {
    transactionsGrid: null, // Store Grid.js instance
    renderStats(stats) {
        document.getElementById('total-value').textContent = Utils.formatCurrency(stats.portfolioValue);
        document.getElementById('total-return').textContent = Utils.formatPercent(stats.totalReturnPct);
        document.getElementById('cagr').textContent = Utils.formatPercent(stats.cagr);
        document.getElementById('cash-balance').textContent = Utils.formatCurrency(stats.cash);
        
        // Show dashboard
        document.getElementById('dashboard').style.display = 'grid';
    },

    renderHoldings(stats) {
        const tbody = document.querySelector('#holdings-table tbody');
        tbody.innerHTML = '';

        // Filter non-zero holdings
        const holdings = Object.entries(stats.holdings).filter(([_, qty]) => Math.abs(qty) > 0.0001);
        
        if (holdings.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="4" style="text-align:center">No active positions</td>';
            return;
        }

        holdings.forEach(([stock, qty]) => {
            const row = tbody.insertRow();
            const price = stats.purchasePrices[stock] || 0;
            const val = qty * price;
            
            row.innerHTML = `
                <td>${stock}</td>
                <td>${qty}</td>
                <td>${Utils.formatCurrency(price)}</td>
                <td>${Utils.formatCurrency(val)}</td>
            `;
        });
    },

    renderChart(history) {
        // 1. Aggregation: Get last entry per day
        const dailyData = {};
        history.forEach(entry => {
            const dateKey = entry.date.toISOString().split('T')[0]; // YYYY-MM-DD
            dailyData[dateKey] = entry;
        });

        const labels = Object.keys(dailyData).sort();
        const values = labels.map(d => dailyData[d].portfolioValue);
        
        // Calculate Return % for chart
        // Return % = (Value - CumulativeDeposits) / CumulativeDeposits
        const returns = labels.map(d => {
            const entry = dailyData[d];
            if (entry.totalDeposits === 0) return 0;
            return ((entry.portfolioValue - entry.totalDeposits) / entry.totalDeposits) * 100;
        });

        const ctx = document.getElementById('portfolioChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Portfolio Value (SEK)',
                        data: values,
                        borderColor: '#2E86AB',
                        backgroundColor: 'rgba(46, 134, 171, 0.1)',
                        yAxisID: 'y',
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'Return (%)',
                        data: returns,
                        borderColor: '#A23B72',
                        backgroundColor: 'rgba(162, 59, 114, 0.1)',
                        yAxisID: 'y1',
                        borderDash: [5, 5],
                        tension: 0.1
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
                                    if (context.datasetIndex === 0) {
                                         label += new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(context.parsed.y);
                                    } else {
                                         label += context.parsed.y.toFixed(2) + '%';
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        grid: {
                            display: false
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
                            text: 'Return (%)',
                            color: '#A23B72'
                        }
                    }
                }
            }
        });
    },

    renderTransactions(historyEvents) {
        const container = document.getElementById('transactions-grid-container');
        
        // Reverse chronological order
        const sortedEvents = [...historyEvents].sort((a, b) => b.date - a.date);

        // Prepare data (No changes to logic here, just the view below)
        const gridData = sortedEvents.map(event => {
            const dateStr = event.date.toISOString().slice(0, 10);
            if (event.type === 'Cashflow') {
                return {
                    date: dateStr,
                    action: event.action,
                    stock: null,
                    quantity: null,
                    price: null,
                    totalValue: event.amount,
                    feeDisplay: null,
                    pnl: null
                };
            } else if (event.type === 'Trade') {
                const totalValAbs = Math.abs(event.totalValue);
                const expectedVal = Math.abs(event.quantity) * event.price;
                let fee = Math.abs(totalValAbs - expectedVal);
                let feePct = 0;
                if (expectedVal > 0) feePct = (fee / expectedVal) * 100;

                let feeDisplay = Utils.formatCurrency(fee);
                if (feePct > 0) feeDisplay += `|${feePct.toFixed(2)}%`; 

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

