// --- Data Service ---
class DataService {
    static async loadData() {
        try {
            const transactions = await this.fetchAndParse(CONFIG.files.transactions, CONFIG.requiredColumns.transactions);
            return { transactions };
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
                quotes: true, // Handle quoted fields
                quoteChar: '"',
                escapeChar: '"',
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

                    // Validate data quality - check for invalid numeric values
                    for (let i = 0; i < data.length; i++) {
                        const row = data[i];
                        const rowNum = i + 2; // +2 because row 1 is header, and arrays are 0-indexed
                        
                        // Check numeric columns
                        const numericColumns = ['Quantity', 'Price', 'Total_Value'];
                        for (const col of numericColumns) {
                            if (row[col] !== null && row[col] !== undefined && row[col] !== '') {
                                // If it's a string, it might contain spaces or invalid characters
                                if (typeof row[col] === 'string') {
                                    // Check for spaces or other invalid characters
                                    if (/\s/.test(row[col])) {
                                        reject(new Error(
                                            `Invalid value in ${filename} row ${rowNum}, column "${col}": "${row[col]}" contains spaces. ` +
                                            `Please use numeric format without spaces (e.g., "1893.94" instead of "1 893.94").`
                                        ));
                                        return;
                                    }
                                    // Try to parse it
                                    const parsed = parseFloat(row[col]);
                                    if (isNaN(parsed)) {
                                        reject(new Error(
                                            `Invalid value in ${filename} row ${rowNum}, column "${col}": "${row[col]}" is not a valid number.`
                                        ));
                                        return;
                                    }
                                } else if (typeof row[col] === 'number' && isNaN(row[col])) {
                                    reject(new Error(
                                        `Invalid value in ${filename} row ${rowNum}, column "${col}": NaN detected.`
                                    ));
                                    return;
                                }
                            }
                        }
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

