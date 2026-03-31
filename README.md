# SmartC IDE — Assembly Generator + CLR Parser

A modern web-based C/C++ IDE that compiles real code to Assembly via **GCC** locally,
with a full CLR (CYK-based) parser and syntax-highlighted token lexer.

## Features

| Feature | Description |
|---|---|
| **Assembly Generator** | Real GCC/G++ compilation via Flask backend |
| **Language** | C and C++ |
| **Architecture** | x86-64 (Intel syntax) and ARM64 |
| **Optimization** | -O0, -O1, -O2, -O3, -Os |
| **Side-by-side Diff** | C++ source vs Assembly lines |
| **Token Lexer** | Color-coded tokens (keyword, type, identifier, operator, …) |
| **CLR Parser** | CYK-based context-free grammar parser with parse tree |

## Setup

### Prerequisites

- Python 3.9+
- GCC / G++ installed (`gcc --version` to check)
- pip

### Install & Run

```bash
cd smartc-ide

# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Run Flask server
python app.py
```

Open browser at: **http://localhost:5000**

### Install GCC (if not installed)

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install build-essential
```

**Windows:**
- Install [MSYS2](https://www.msys2.org/) → `pacman -S mingw-w64-x86_64-gcc`
- Or install [TDM-GCC](https://jmeubank.github.io/tdm-gcc/)

**macOS:**
```bash
xcode-select --install
```

## Usage

1. Write C/C++ code in the left editor
2. Select Language, Architecture, Optimization level
3. Click **Compile** (or press `Ctrl+Enter`)
4. Switch tabs to see Assembly Output, Diff, Tokens, or CLR Parser

## CLR Parser Grammar Format

```
S -> a S b
S -> a b
```

- Non-terminals: **Uppercase** (e.g., `S`, `A`, `Expr`)
- Terminals: **lowercase** or symbols (e.g., `a`, `b`, `+`)
- Symbols separated by **spaces**
- Multiple rules for the same non-terminal allowed
- Input: character-by-character, OR space-separated if spaces are in input

## Project Structure

```
smartc-ide/
├── app.py              ← Flask backend (compile, tokenize, parse_clr)
├── requirements.txt
├── templates/
│   └── index.html      ← Main HTML template
└── static/
    ├── css/style.css   ← Dark terminal UI
    └── js/app.js       ← Frontend logic
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/compile` | POST | Compile C/C++ → Assembly via GCC |
| `/tokenize` | POST | Lex source code into tokens |
| `/parse_clr` | POST | CYK parse with BNF grammar |

## Tech Stack

- **Backend**: Flask 3 + flask-cors
- **Compiler**: System GCC/G++ (real compilation)
- **Parser**: CYK algorithm with CNF binarisation
- **Frontend**: Vanilla JS + CSS (no frameworks, no npm)
- **Font**: JetBrains Mono + Space Mono
