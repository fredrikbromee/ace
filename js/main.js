async function runDashboard(transactions, benchmarkData) {
    Dashboard.cleanup();

    const errorDisplay = document.getElementById('error-display');
    errorDisplay.style.display = 'none';
    errorDisplay.textContent = '';

    const engine = new PortfolioEngine(transactions);
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

    Dashboard.renderStats(stats, benchmarkStats);
    Dashboard.renderHoldings(stats);
    Dashboard.renderCharts(portfolioHistory, benchmarkHistory, portfolioTWR, benchmarkTWR);
    Dashboard.renderTransactions(engine.processedEvents);
}

(async function init() {
    let benchmarkData;

    try {
        const data = await DataService.loadData();
        console.log('Data loaded successfully');
        benchmarkData = data.benchmarkData;
        await runDashboard(data.transactions, benchmarkData);
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

            // Load benchmark data if not already loaded
            if (!benchmarkData) {
                benchmarkData = await DataService.loadBenchmarkData();
            }

            await runDashboard(transactions, benchmarkData);
            statusEl.textContent = `Loaded ${transactions.length} transactions`;
        } catch (e) {
            console.error(e);
            statusEl.className = 'upload-status error';
            statusEl.textContent = e.message;
        }
    });
})();
