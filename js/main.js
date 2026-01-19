(async function init() {
    try {
        const data = await DataService.loadData();
        console.log('Data loaded successfully');

        // Process portfolio
        const engine = new PortfolioEngine(data.transactions);
        const portfolioHistory = engine.process();
        
        // Calculate TWR before getting stats (stats needs TWR for annualization)
        const portfolioTWR = engine.calculateTWR();
        const stats = engine.getStats();

        if (!stats) {
            throw new Error("No portfolio history generated. Check data dates.");
        }

        // Process benchmark - pass both capitalFlows and buyEvents
        const benchmarkEngine = new BenchmarkEngine(
            engine.capitalFlows,  // For XIRR calculation (fair comparison)
            engine.buyEvents,     // For shadow portfolio simulation
            data.benchmarkData
        );
        const benchmarkHistory = benchmarkEngine.process();
        
        // Calculate TWR before getting stats
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

    } catch (e) {
        console.error(e);
        if (document.getElementById('error-display').style.display !== 'block') {
             Utils.showError("Calculation Error: " + e.message);
        }
    }
})();
