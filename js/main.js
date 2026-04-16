async function runDashboard(transactions, benchmarkData, stockPrices, annotations = []) {
    Dashboard.cleanup();

    const errorDisplay = document.getElementById('error-display');
    errorDisplay.style.display = 'none';
    errorDisplay.textContent = '';

    const tradingDays = Object.keys(benchmarkData).sort();
    const engine = new PortfolioEngine(transactions, stockPrices, tradingDays);
    const portfolioHistory = engine.process();

    const portfolioTWR = engine.calculateTWR();
    const stats = engine.getStats();

    if (!stats) {
        throw new Error("No portfolio history generated. Check data dates.");
    }

    const benchmarkEngine = new BenchmarkEngine(
        engine.capitalFlows,
        engine.buyEvents,
        benchmarkData
    );
    const benchmarkHistory = benchmarkEngine.process();

    const benchmarkTWR = benchmarkEngine.calculateTWR();
    const benchmarkStats = benchmarkEngine.getStats();

    console.log('Portfolio Annualized TWR:', stats.annualizedTWR.toFixed(2) + '%');
    console.log('Benchmark Annualized TWR:', benchmarkStats ? benchmarkStats.benchmarkAnnualizedTWR.toFixed(2) + '%' : 'N/A');
    console.log('Alpha:', benchmarkStats ? (stats.annualizedTWR - benchmarkStats.benchmarkAnnualizedTWR).toFixed(2) + '%' : 'N/A');
    console.log('Total capital in:', stats.totalCapitalIn);
    console.log('Final portfolio value:', stats.portfolioValue);

    Dashboard.renderStats(stats);
    Dashboard.renderComparisonTable(stats, benchmarkStats, portfolioTWR, benchmarkTWR);
    Dashboard.renderHoldings(stats);
    Dashboard.renderCharts(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR, annotations);
    Dashboard.renderAnnotations(annotations);
    Dashboard.renderTransactions(engine.processedEvents);
}

(async function init() {
    let benchmarkData;
    let stockPrices;
    let annotations = [];

    try {
        const data = await DataService.loadData();
        console.log('Data loaded successfully');
        benchmarkData = data.benchmarkData;
        stockPrices = data.stockPrices;
        annotations = data.annotations || [];
        await runDashboard(data.transactions, benchmarkData, stockPrices, annotations);
    } catch (e) {
        console.error(e);
        if (document.getElementById('error-display').style.display !== 'block') {
             Utils.showError("Calculation Error: " + e.message);
        }
    }

    // Set up file upload handler
    document.getElementById('csv-upload').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('upload-status');
        statusEl.className = 'upload-status';
        statusEl.textContent = 'Processing...';

        try {
            const text = await file.text();
            const transactions = await DataService.parseUploadedCSV(text);

            // Load benchmark and stock data if not already loaded
            if (!benchmarkData) {
                benchmarkData = await DataService.loadBenchmarkData();
            }
            if (!stockPrices) {
                const stockNames = [...new Set(transactions.filter(t => t.Stock).map(t => t.Stock))];
                stockPrices = await DataService.loadStockPrices(stockNames);
            }
            if (!annotations.length) {
                annotations = await DataService.loadAnnotations();
            }

            await runDashboard(transactions, benchmarkData, stockPrices, annotations);
            statusEl.textContent = `Loaded ${transactions.length} transactions`;
        } catch (e) {
            console.error(e);
            statusEl.className = 'upload-status error';
            statusEl.textContent = e.message;
        }
    });
})();
