#!/bin/bash
# Copies market data from the granite/omx30II sister project into ace/data/
# Only includes data from the oldest transaction date onward.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE_DIR="/Users/fredrikbromee/projects/granite/omx30II/data/omx30/intermediate"
DEST_STOCKS="$PROJECT_DIR/data/stocks"
DEST_DATA="$PROJECT_DIR/data"
TRANSACTIONS="$PROJECT_DIR/transactions.csv"

# Find oldest transaction date from transactions.csv
# Skip header, extract date column, sort, take first
OLDEST_DATE=$(tail -n +2 "$TRANSACTIONS" | cut -d',' -f1 | sort | head -1)
echo "Oldest transaction date: $OLDEST_DATE"

mkdir -p "$DEST_STOCKS"

# Copy and filter a CSV: keep header + rows where date >= OLDEST_DATE
filter_csv() {
    local src="$1"
    local dest="$2"
    local cutoff="$3"

    # Header line
    head -1 "$src" > "$dest"
    # Data lines: compare first 10 chars of date field against cutoff
    tail -n +2 "$src" | while IFS= read -r line; do
        row_date="${line:0:10}"
        if [[ "$row_date" > "$cutoff" || "$row_date" == "$cutoff" ]]; then
            echo "$line"
        fi
    done >> "$dest"
}

# Copy all .ST.csv stock files from source
for src in "$SOURCE_DIR"/*.ST.csv; do
    file="$(basename "$src")"
    filter_csv "$src" "$DEST_STOCKS/$file" "$OLDEST_DATE"
    lines=$(( $(wc -l < "$DEST_STOCKS/$file") - 1 ))
    echo "Copied $file ($lines data rows)"
done

# Copy benchmark (^OMX.csv)
BENCHMARK_SRC="$SOURCE_DIR/^OMX.csv"
if [[ -f "$BENCHMARK_SRC" ]]; then
    filter_csv "$BENCHMARK_SRC" "$DEST_DATA/^OMX.csv" "$OLDEST_DATE"
    lines=$(( $(wc -l < "$DEST_DATA/^OMX.csv") - 1 ))
    echo "Copied ^OMX.csv ($lines data rows)"
else
    echo "WARNING: $BENCHMARK_SRC not found"
fi

echo "Done."
