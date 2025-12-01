# VS Code / Cursor Jupyter Extension Setup Guide

## Required Extensions

To work with Jupyter notebooks in VS Code or Cursor, you'll need the following extensions:

### 1. Jupyter Extension (Required)
- **Extension ID**: `ms-toolsai.jupyter`
- **Name**: Jupyter
- **Publisher**: Microsoft

### 2. Python Extension (Required - usually auto-installed with Jupyter)
- **Extension ID**: `ms-python.python`
- **Name**: Python
- **Publisher**: Microsoft

## Installation Methods

### Method 1: Via Extensions View (Recommended)

1. **Open Extensions View**:
   - Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux)
   - Or click the Extensions icon in the left sidebar

2. **Search for "Jupyter"**:
   - Type "Jupyter" in the search box
   - Look for the official "Jupyter" extension by Microsoft

3. **Install**:
   - Click the "Install" button on the Jupyter extension
   - The Python extension should automatically be suggested/installed as a dependency

4. **Verify Installation**:
   - After installation, you should see a "Jupyter" icon in the left sidebar
   - You can now open `.ipynb` files directly in VS Code/Cursor

### Method 2: Via Command Palette

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Extensions: Install Extensions"
3. Search for "Jupyter" and install

### Method 3: Via Command Line (if VS Code CLI is configured)

```bash
code --install-extension ms-toolsai.jupyter
code --install-extension ms-python.python
```

## After Installation

1. **Select Python Interpreter**:
   - Press `Cmd+Shift+P` / `Ctrl+Shift+P`
   - Type "Python: Select Interpreter"
   - Choose your Python environment (or create a virtual environment)

2. **Create/Open a Notebook**:
   - Create a new file with `.ipynb` extension
   - Or open an existing Jupyter notebook
   - VS Code/Cursor will automatically recognize it

3. **Install Jupyter in Your Environment**:
   ```bash
   # On macOS, use pip3 instead of pip
   pip3 install -r requirements.txt
   ```
   
   **Note for macOS users**: If you get "command not found: pip", use `pip3` instead. You can also run Jupyter commands using:
   ```bash
   python3 -m jupyter notebook
   python3 -m jupyter lab
   ```

## Troubleshooting

- **"command not found: pip"** (macOS): Use `pip3` instead of `pip`, or use `python3 -m pip`
- **"command not found: jupyter"**: Use `python3 -m jupyter` instead, or add Python's bin directory to your PATH
- If notebooks don't render: Make sure both Jupyter and Python extensions are installed
- If kernel selection fails: Ensure you've selected a Python interpreter with Jupyter installed
- If you see "Jupyter not found": Run `pip3 install -r requirements.txt` (or `python3 -m pip install -r requirements.txt`)

## Recommended Additional Extensions (Optional)

- **Jupyter Keymap**: `ms-toolsai.jupyter-keymap` - Jupyter keyboard shortcuts
- **Jupyter Notebook Renderers**: `ms-toolsai.jupyter-renderers` - Enhanced notebook rendering

