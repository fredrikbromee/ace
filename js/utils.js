// --- Utils ---
const Utils = {
    parseDate(dateString) {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${dateString}`);
        }
        return date;
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
    },

    formatPercent(amount) {
        return new Intl.NumberFormat('sv-SE', { style: 'percent', minimumFractionDigits: 2 }).format(amount / 100);
    },
    
    showError(message) {
        const errorEl = document.getElementById('error-display');
        errorEl.textContent = `Error: ${message}`;
        errorEl.style.display = 'block';
        console.error(message);
        // Fail fast: stop further processing visually (logic stops via throw)
    }
};

