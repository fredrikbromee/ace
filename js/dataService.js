class DataService {
    static async loadData() {
        try {
            const transactions = await this.fetchAndParse(CONFIG.files.transactions, CONFIG.requiredColumns.transactions);
            // Extract unique stock names from transactions
            const stockNames = [...new Set(
                transactions
                    .filter(t => t.Stock)
                    .map(t => t.Stock)
            )];
            const [benchmarkData, stockPrices] = await Promise.all([
                this.loadBenchmarkData(),
                this.loadStockPrices(stockNames)
            ]);
            return { transactions, benchmarkData, stockPrices };
        } catch (error) {
            Utils.showError(error.message);
            throw error; // Stop execution
        }
    }

    static async loadStockPrices(stockNames) {
        const stockPrices = {};
        const promises = stockNames
            .filter(name => CONFIG.stockFileMapping && CONFIG.stockFileMapping[name])
            .map(async (name) => {
                const filename = CONFIG.files.stockDataDir + CONFIG.stockFileMapping[name];
                try {
                    const priceLookup = await new Promise((resolve, reject) => {
                        Papa.parse(filename, {
                            download: true,
                            header: true,
                            skipEmptyLines: true,
                            dynamicTyping: true,
                            complete: (results) => {
                                if (results.errors.length > 0) {
                                    reject(new Error(`Parsing error in ${filename}: ${results.errors[0].message}`));
                                    return;
                                }
                                const lookup = {};
                                (results.data || []).forEach(row => {
                                    if (row.Date && row.Close != null) {
                                        const dateStr = row.Date.toString().slice(0, 10);
                                        lookup[dateStr] = row.Close;
                                    }
                                });
                                resolve(lookup);
                            },
                            error: (err) => {
                                reject(new Error(`Failed to load ${filename}: ${err.message}`));
                            }
                        });
                    });
                    stockPrices[name] = priceLookup;
                } catch (e) {
                    console.warn(`Could not load market data for ${name}: ${e.message}`);
                }
            });
        await Promise.all(promises);
        return stockPrices;
    }

    static async loadBenchmarkData() {
        return new Promise((resolve, reject) => {
            Papa.parse(CONFIG.files.benchmark, {
                download: true,
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`Parsing error in benchmark file: ${results.errors[0].message}`));
                        return;
                    }

                    const data = results.data;
                    if (!data || data.length === 0) {
                        reject(new Error('Benchmark file is empty'));
                        return;
                    }

                    // Create lookup map: { "2025-11-21": 2699.35, ... }
                    const priceLookup = {};
                    data.forEach(row => {
                        if (row.Date && row.Close) {
                            // Extract just the date part (YYYY-MM-DD) from datetime string
                            const dateStr = row.Date.toString().slice(0, 10);
                            priceLookup[dateStr] = row.Close;
                        }
                    });

                    resolve(priceLookup);
                },
                error: (err) => {
                    reject(new Error(`Failed to load benchmark data: ${err.message}`));
                }
            });
        });
    }

    static parseUploadedCSV(fileContent) {
        return new Promise((resolve, reject) => {
            Papa.parse(fileContent, {
                header: true,
                skipEmptyLines: true,
                delimiter: ';',
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`Parsing error: ${results.errors[0].message}`));
                        return;
                    }

                    const data = results.data;
                    if (!data || data.length === 0) {
                        reject(new Error('Uploaded file is empty'));
                        return;
                    }

                    // Check for expected Swedish columns
                    const headers = results.meta.fields;
                    const required = ['Datum', 'Konto', 'Typ av transaktion', 'Värdepapper/beskrivning', 'Antal', 'Kurs', 'Belopp'];
                    const missing = required.filter(col => !headers.includes(col));
                    if (missing.length > 0) {
                        reject(new Error(`Missing columns in uploaded file: ${missing.join(', ')}`));
                        return;
                    }

                    // Filter relevant transaction types, then transform
                    const allowedTypes = ['Köp', 'Sälj', 'Utdelning', 'Utländsk källskatt'];
                    const transformed = data
                        .filter(row => allowedTypes.includes(row['Typ av transaktion']))
                        .map(row => {
                            const parseSwedishNum = (val) => {
                                if (val === null || val === undefined || val === '') return 0;
                                return parseFloat(String(val).replace(',', '.'));
                            };
                            let price = parseSwedishNum(row['Kurs']);
                            const exchangeRate = parseSwedishNum(row['Valutakurs']);
                            if (exchangeRate > 0) {
                                price = price * exchangeRate;
                            }
                            return {
                                Date: row['Datum'],
                                Account: String(row['Konto']).replace(/ kreditkonto$/, ''),
                                Action: row['Typ av transaktion'],
                                Stock: row['Värdepapper/beskrivning'],
                                Quantity: parseSwedishNum(row['Antal']),
                                Price: price,
                                Total_Value: parseSwedishNum(row['Belopp'])
                            };
                        });

                    if (transformed.length === 0) {
                        reject(new Error('No buy/sell transactions found in uploaded file'));
                        return;
                    }

                    resolve(transformed);
                },
                error: (err) => {
                    reject(new Error(`Failed to parse uploaded file: ${err.message}`));
                }
            });
        });
    }

    static fetchAndParse(filename, requiredCols) {
        return new Promise((resolve, reject) => {
            Papa.parse(filename, {
                download: true,
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                quotes: true,
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

                    const headers = results.meta.fields;
                    const missing = requiredCols.filter(col => !headers.includes(col));
                    if (missing.length > 0) {
                        reject(new Error(`Missing required columns in ${filename}: ${missing.join(', ')}`));
                        return;
                    }

                    for (let i = 0; i < data.length; i++) {
                        const row = data[i];
                        const rowNum = i + 2;
                        
                        const numericColumns = ['Quantity', 'Price', 'Total_Value'];
                        for (const col of numericColumns) {
                            if (row[col] !== null && row[col] !== undefined && row[col] !== '') {
                                if (typeof row[col] === 'string') {
                                    if (/\s/.test(row[col])) {
                                        reject(new Error(
                                            `Invalid value in ${filename} row ${rowNum}, column "${col}": "${row[col]}" contains spaces. ` +
                                            `Please use numeric format without spaces (e.g., "1893.94" instead of "1 893.94").`
                                        ));
                                        return;
                                    }
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataService;
}

