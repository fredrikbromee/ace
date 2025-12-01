# ACE Project

Python project with Jupyter notebook support.

## Python Setup

This project uses **Python 3.12.10** via Homebrew, managed through a virtual environment.

### Quick Start

1. **Activate the virtual environment**:
   ```bash
   source venv/bin/activate
   ```
   Or use the helper function (if you've sourced your `.zshrc`):
   ```bash
   ace-env
   ```

2. **Install dependencies** (if not already installed):
   ```bash
   pip install -r requirements.txt
   ```

3. **Run Jupyter**:
   ```bash
   jupyter notebook
   # or
   jupyter lab
   ```

## Python Version Management

Your system is configured to use **Homebrew Python 3.12** as the default. The `.zshrc` file includes:
- Aliases for `python3` and `pip3` pointing to Homebrew Python 3.12
- PATH configuration to prioritize Homebrew binaries

### Available Python Versions

- **Python 3.12.10** (Homebrew) - `/opt/homebrew/bin/python3.12` - **DEFAULT**
- Python 3.9.6 (System) - `/usr/bin/python3` - Legacy, not recommended for new projects

## Virtual Environment

The project uses a virtual environment located at `venv/` to isolate dependencies. This is already in `.gitignore` and should not be committed.

### Creating a New Virtual Environment

If you need to recreate the virtual environment:

```bash
# Remove old venv
rm -rf venv

# Create new venv with Homebrew Python 3.12
/opt/homebrew/bin/python3.12 -m venv venv

# Activate and install dependencies
source venv/bin/activate
pip install -r requirements.txt
```

## VS Code / Cursor Setup

See `VSCODE_SETUP.md` for instructions on setting up Jupyter extensions in your editor.

## Project Structure

```
ace/
├── venv/              # Virtual environment (gitignored)
├── .gitignore         # Git ignore patterns
├── requirements.txt   # Python dependencies
├── README.md          # This file
└── VSCODE_SETUP.md    # Editor setup guide
```


