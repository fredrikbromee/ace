(async function init() {
    try {
        const data = await DataService.loadData();
        console.log('Data loaded successfully');

        const engine = new PortfolioEngine(data.transactions);
        const history = engine.process();
        const stats = engine.getStats();

        if (!stats) {
            throw new Error("No portfolio history generated. Check data dates.");
        }

        Dashboard.renderStats(stats);
        Dashboard.renderHoldings(stats);
        Dashboard.renderChart(history);
        Dashboard.renderTransactions(engine.processedEvents);

    } catch (e) {
        console.error(e);
        if (document.getElementById('error-display').style.display !== 'block') {
             Utils.showError("Calculation Error: " + e.message);
        }
    }
})();

