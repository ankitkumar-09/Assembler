from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import subprocess
import tempfile
import os
import re

app = Flask(__name__)
CORS(app)

COMPILERS = {
    "c":   {"x86-64": ["gcc",  "-S", "-masm=intel"], "arm64": ["gcc",  "-S", "-march=armv8-a"]},
    "c++": {"x86-64": ["g++",  "-S", "-masm=intel"], "arm64": ["g++",  "-S", "-march=armv8-a"]},
}
EXT = {"c": ".c", "c++": ".cpp"}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/compile", methods=["POST"])
def compile_code():
    data        = request.json or {}
    source      = data.get("source", "").strip()
    lang        = data.get("lang", "c++")
    opt         = data.get("opt", "-O0")
    arch        = data.get("arch", "x86-64")
    clean_mode  = data.get("clean", True)

    if not source:
        return jsonify({"error": "Empty source"}), 400

    compiler_args = COMPILERS.get(lang, COMPILERS["c++"]).get(arch, COMPILERS["c++"]["x86-64"])
    ext           = EXT.get(lang, ".cpp")

    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, f"src{ext}")
        asm_path = os.path.join(tmpdir, "src.s")

        with open(src_path, "w") as f:
            f.write(source)

        cmd    = compiler_args + [opt, "-o", asm_path, src_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

        if result.returncode != 0:
            return jsonify({"error": result.stderr or result.stdout})

        if not os.path.exists(asm_path):
            return jsonify({"error": "Compiler produced no output"})

        with open(asm_path) as f:
            asm = f.read()

        cleaned = _clean_asm(asm) if clean_mode else asm
        return jsonify({"asm": cleaned, "raw": asm, "lines": len(cleaned.splitlines())})


_NOISE_PREFIXES = (
    ".cfi_", ".loc ", ".file ", ".section", ".globl", ".p2align",
    ".align", ".type ", ".size ", ".ident", ".note", ".build",
    ".weak", ".comm", ".quad", ".long", ".byte", ".short",
    ".asciz", ".string", ".space", ".set ", ".loh ",
)
_NOISE_LABEL_RE = re.compile(
    r'^(Ltmp\d+|Lloh\d+|Lfunc_begin\d+|Lfunc_end\d+|'
    r'Lcst_begin\d+|Lcst_end\d+|Lttbase\w*|Lttbaseref\w*|'
    r'GCC_except_table\d+|Lexception\d+|'
    r'\.Lfunc_begin\d+|\.Lfunc_end\d+|'
    r'Leh_func_end\d+|LEH_Proj\d+):$'
)
_STD_FUNC_RE  = re.compile(
    r'(__ZNSt|__ZNKSt|___cxa|___clang|__Unwind|'
    r'__ZdlPv|__Znwm|__ZSt|_memset|_memcpy|'
    r'__ZNSt3__1|__ZNK8|_ZNSt|_ZSt)'
)
_STR_LABEL_RE = re.compile(r'^l_\.str[\w.]*:')


def _clean_asm(asm: str) -> str:
    lines       = []
    in_std_func = False
    prev_blank  = False

    for raw in asm.splitlines():
        line     = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            if not prev_blank and lines:
                lines.append("")
            prev_blank = True
            continue
        prev_blank = False

        if stripped.startswith("#"):              continue
        if _NOISE_LABEL_RE.match(stripped):       continue
        if _STR_LABEL_RE.match(stripped):         continue
        if any(stripped.startswith(p) for p in _NOISE_PREFIXES): continue

        if stripped.endswith(":") and _STD_FUNC_RE.search(stripped):
            in_std_func = True
            continue

        if in_std_func:
            if re.match(r'^[\w_][\w\d_.]*:', stripped) and not _STD_FUNC_RE.search(stripped):
                in_std_func = False
            else:
                continue

        if stripped.startswith(".") and not re.match(r'^\.(text|data|bss|rodata)\b', stripped):
            continue

        lines.append(line)

    result     = []
    prev_blank = False
    for l in lines:
        if l == "":
            if not prev_blank:
                result.append("")
            prev_blank = True
        else:
            prev_blank = False
            result.append(l)

    return "\n".join(result).strip()


@app.route("/tokenize", methods=["POST"])
def tokenize():
    data   = request.json or {}
    source = data.get("source", "")

    KEYWORDS = {
        "int","float","double","char","bool","void","return","if","else",
        "while","for","do","switch","case","break","continue","struct",
        "class","public","private","protected","new","delete","namespace",
        "using","include","cout","cin","endl","string","auto","long",
        "short","unsigned","signed","nullptr","true","false","const",
        "static","inline","template","typename","virtual","override",
    }
    TYPES = {"int","float","double","char","bool","void","string","auto",
             "long","short","unsigned","signed","size_t","wchar_t"}

    pattern = re.compile(
    r'"(?:[^"\\]|\\.)*"'
    r"|'(?:[^'\\]|\\.)*'"
    r"|//[^\n]*"
    r"|/\*.*?\*/"
    r"|[a-zA-Z_]\w*"
    r"|\d+\.?\d*(?:[eE][+-]?\d+)?"
    r"|[+\-*/%=!<>&|^~]{1,3}"
    r"|[(){}\[\];,.:?#]"
    r"|\s+",
    re.DOTALL,
)

    tokens = []
    for m in pattern.finditer(source):
        tok = m.group(0)
        if re.match(r"^\s+$", tok):
            continue
        if tok.startswith("//") or tok.startswith("/*"):
            kind = "comment"
        elif tok.startswith('"') or tok.startswith("'"):
            kind = "string"
        elif re.match(r"^\d", tok):
            kind = "number"
        elif tok in TYPES:
            kind = "type"
        elif tok in KEYWORDS:
            kind = "keyword"
        elif re.match(r"^[a-zA-Z_]\w*$", tok):
            kind = "identifier"
        elif re.match(r"^[+\-*/%=!<>&|^~]+$", tok):
            kind = "operator"
        else:
            kind = "punctuation"
        tokens.append({"value": tok, "kind": kind})

    return jsonify({"tokens": tokens})


if __name__ == "__main__":
    app.run(debug=True, port=5000)