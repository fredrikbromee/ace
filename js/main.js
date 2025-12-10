// --- Main Execution Block ---
(async function init() {
    try {
        // 1. Load Data
        const data = await DataService.loadData();
        console.log('Data loaded successfully');

        // 2. Process Data
        const engine = new PortfolioEngine(data.transactions);
        const history = engine.process();
        const stats = engine.getStats();

        if (!stats) {
            throw new Error("No portfolio history generated. Check data dates.");
        }

        // 3. Render UI
        Dashboard.renderStats(stats);
        Dashboard.renderHoldings(stats);
        Dashboard.renderChart(history);
        Dashboard.renderTransactions(engine.processedEvents);

    } catch (e) {
        console.error(e);
        // Utils.showError called in DataService, but if logic fails here:
        if (document.getElementById('error-display').style.display !== 'block') {
             Utils.showError("Calculation Error: " + e.message);
        }
    }
})();

