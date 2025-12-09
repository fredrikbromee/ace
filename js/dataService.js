// --- Data Service ---
class DataService {
    static async loadData() {
        try {
            const [trades, cashflows] = await Promise.all([
                this.fetchAndParse(CONFIG.files.trades, CONFIG.requiredColumns.trades),
                this.fetchAndParse(CONFIG.files.cashflows, CONFIG.requiredColumns.cashflows)
            ]);
            return { trades, cashflows };
        } catch (error) {
            Utils.showError(error.message);
            throw error; // Stop execution
        }
    }

    static fetchAndParse(filename, requiredCols) {
        return new Promise((resolve, reject) => {
            Papa.parse(filename, {
                download: true,
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true, // Auto-convert numbers
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`Parsing error in ${filename}: ${results.errors[0].message}`));
                        return;
                    }
                    
                    const data = results.data;
                    if (!data || data.length === 0) {
                        reject(new Error(`File ${filename} is empty`));
                        return;
                    }

                    // Validate headers
                    const headers = results.meta.fields;
                    const missing = requiredCols.filter(col => !headers.includes(col));
                    if (missing.length > 0) {
                        reject(new Error(`Missing required columns in ${filename}: ${missing.join(', ')}`));
                        return;
                    }

                    resolve(data);
                },
                error: (err) => {
                    reject(new Error(`Failed to load ${filename}: ${err.message}`));
                }
            });
        });
    }
}

