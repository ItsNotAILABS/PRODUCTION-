"""Structural extraction — symbols and call sites, per language.

Two parsers, chosen deliberately rather than for uniformity:

**Python keeps stdlib ``ast``.** Tree-sitter would work, but ``ast`` already
gives exact spans, docstrings, decorators, base classes and comprehension
structure for free, and it is the language this service is written in — the
index of its own source should be the most accurate one it produces.

**Everything else uses tree-sitter.** The previous release scanned JavaScript
with a regex and marked the spans ``exact: false``, which was honest but not
useful: you cannot edit against a boundary that was guessed by looking for the
*next* declaration. A real parse gives true end lines, so Go, TypeScript, PHP,
Pascal/Delphi, Java, Rust, Ruby and Kotlin now get the same guarantee Python
had.

What comes out is deliberately small: a symbol list, and a list of *call sites*
naming the callee and the enclosing symbol. Resolving those names to definitions
is `graph.py`'s job, because resolution needs the whole repo and parsing does
not.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path

# --- language mapping ---------------------------------------------------------

# Extension -> (tree-sitter language, display name). Only languages actually
# present in the bundled grammar pack appear here; an extension that is not
# listed degrades to metadata-only rather than pretending to a parse.
EXT_LANG = {
    ".go": ("go", "go"),
    ".ts": ("typescript", "typescript"),
    ".mts": ("typescript", "typescript"),
    ".tsx": ("tsx", "typescript"),
    ".js": ("javascript", "javascript"),
    ".mjs": ("javascript", "javascript"),
    ".cjs": ("javascript", "javascript"),
    ".jsx": ("javascript", "javascript"),
    ".php": ("php", "php"),
    ".pas": ("pascal", "pascal"),
    ".pp": ("pascal", "pascal"),
    ".dpr": ("pascal", "pascal"),
    ".java": ("java", "java"),
    ".rs": ("rust", "rust"),
    ".rb": ("ruby", "ruby"),
    ".kt": ("kotlin", "kotlin"),
    ".kts": ("kotlin", "kotlin"),
}

# Node types that declare something worth indexing, per grammar. Grammars
# disagree about naming, so this is a lookup rather than a clever heuristic —
# a heuristic here fails silently on one language and nobody notices for months.
DECL_TYPES = {
    "function_declaration": "function",
    "function_definition": "function",
    "function_item": "function",             # rust
    "method_declaration": "method",
    "method_definition": "method",
    "method_spec": "method",                 # go interface methods
    "class_declaration": "class",
    "class_definition": "class",
    "class_specifier": "class",
    "interface_declaration": "interface",
    "type_spec": "type",                     # go — the named half of `type X ...`
    "type_alias_declaration": "type",
    "struct_item": "type",                   # rust
    "enum_item": "type",
    "enum_declaration": "type",
    "impl_item": "impl",                     # rust
    "trait_item": "interface",
    "module": "module",                       # ruby
    "method": "method",                       # ruby
    "singleton_method": "method",             # ruby — `def self.x`
    "class": "class",                         # ruby
    "arrow_function": "function",
    "generator_function_declaration": "function",
    "object_declaration": "class",            # kotlin
    # Pascal/Delphi. `defProc` is the implementation (it owns the body, so it
    # owns the real span); `declProc` is the interface-section forward
    # declaration. Both are indexed and the dedup below keeps the definition.
    "defProc": "function",
    "declProc": "function",
    "declType": "type",
}

CALL_TYPES = {"call", "call_expression", "method_invocation", "function_call_expression",
              "invocation_expression", "macro_invocation", "new_expression",
              "exprCall"}

_CONTAINER = {"class", "interface", "impl", "module", "type"}

# Node types that carry a declared name. Kotlin's `simple_identifier` is the
# reason this is a named set rather than three inline tuples that drifted apart.
_NAME_TYPES = ("identifier", "simple_identifier", "type_identifier", "field_identifier",
               "property_identifier", "constant", "name")


@dataclass
class CallSite:
    """One call, before resolution. ``callee`` is a name, not a target."""
    caller: str | None        # enclosing symbol, None at module level
    callee: str
    line: int


@dataclass
class Extract:
    symbols: list            # list[Symbol], built by the caller's dataclass
    calls: list              # list[CallSite]
    imports: list
    exact: bool
    notes: list


# --- tree-sitter --------------------------------------------------------------

_PARSERS: dict = {}
_TS_AVAILABLE: bool | None = None


def treesitter_available() -> bool:
    """Whether the grammar pack imported. Cached — the probe is not free."""
    global _TS_AVAILABLE
    if _TS_AVAILABLE is None:
        try:
            import tree_sitter_language_pack  # noqa: F401
            _TS_AVAILABLE = True
        except Exception:
            _TS_AVAILABLE = False
    return _TS_AVAILABLE


def _parser(lang: str):
    if lang not in _PARSERS:
        from tree_sitter_language_pack import get_parser
        _PARSERS[lang] = get_parser(lang)
    return _PARSERS[lang]


def _text(node, src: bytes) -> str:
    return src[node.start_byte:node.end_byte].decode("utf8", "replace")


def _decl_name(node, src: bytes) -> tuple:
    """``(name, explicit_owner)`` for a declaration node.

    Falling back to "first identifier child" is what makes this work across nine
    grammars without nine special cases, but it is also why the field lookup is
    tried first: in Go a method's first identifier is its *receiver*, and the
    fallback alone would index every method under the receiver's name.

    ``explicit_owner`` is only set where the source itself names the owner at
    the definition site — Delphi's ``procedure TCatalog.Total``. Everywhere else
    ownership comes from nesting and this is None.
    """
    for field in ("name", "declarator", "type", "pattern"):
        child = node.child_by_field_name(field)
        if child is not None:
            if child.type == "genericDot":
                break        # qualified name — handled by the child scan below
            if child.type in _NAME_TYPES:
                return _text(child, src), None
            for sub in child.children:
                if "identifier" in sub.type:
                    return _text(sub, src), None
    for child in node.children:
        # Pascal qualifies an implementation with its class: `procedure
        # TCatalog.Total`. The trailing identifier is the member; the leading one
        # is the owner, and reading it as the name would file every method of a
        # class beneath the class's own name.
        if child.type == "genericDot":
            ids = [_text(c, src) for c in child.children if c.type == "identifier"]
            if ids:
                return ids[-1], (ids[-2] if len(ids) > 1 else None)
        if child.type in _NAME_TYPES:
            return _text(child, src), None
        # A wrapper node that exists only to hold the declaration: Pascal's
        # `defProc` around a `declProc`, Go's `type_declaration` around a
        # `type_spec`.
        if child.type in ("declProc", "type_spec"):
            return _decl_name(child, src)
    return None, None


def _dedup(symbols: list) -> list:
    """Collapse a symbol declared twice into the declaration that has the body.

    Two grammars produce this: Pascal states a routine in the interface section
    and again in the implementation, and several grammars nest a named node
    inside its own wrapper. Keeping both would double the symbol count and make
    ``locate`` report a spurious ambiguity on every Pascal unit.

    Overloads are preserved: the rule only drops a symbol when another of the
    same name, owner *and kind* strictly contains it, or is a multi-line
    definition where this one is a bodyless one-liner. Two real overloads have
    distinct multi-line bodies at distinct locations, so neither fires. The kind
    check matters more than it looks — Rust writes a one-line ``struct Catalog``
    beside a multi-line ``impl Catalog``, and without it the struct disappears.
    """
    keep = []
    for s in symbols:
        drop = False
        for other in symbols:
            if (other is s or other.name != s.name or other.parent != s.parent
                    or other.kind != s.kind):
                continue
            contains = (other.line_start <= s.line_start
                        and other.line_end >= s.line_end
                        and (other.line_end - other.line_start) > (s.line_end - s.line_start))
            forward = (s.line_end == s.line_start and other.line_end > other.line_start)
            if contains or forward:
                drop = True
                break
        if not drop:
            keep.append(s)
    return keep


def _callee_name(node, src: bytes) -> str | None:
    """The bare name being called, with any receiver stripped.

    ``a.b.parse(x)`` yields ``parse``. Keeping the receiver would make
    resolution look precise while actually being brittle — the receiver's type
    is usually unknown at this stage, so the trailing name is the honest unit
    and the confidence level downstream says as much.
    """
    fn = node.child_by_field_name("function") or node.child_by_field_name("name")
    if fn is None:
        for child in node.children:
            if child.type in ("identifier", "simple_identifier", "selector_expression",
                              "member_expression", "field_expression", "scoped_identifier",
                              "navigation_expression"):
                fn = child
                break
    if fn is None:
        return None
    raw = _text(fn, src)
    name = raw.split("(")[0].strip()
    for sep in ("::", "->", "."):
        if sep in name:
            name = name.rsplit(sep, 1)[-1]
    name = name.strip()
    return name if name.isidentifier() else None


def _doc_comment(node, src: bytes, lines: list) -> str:
    """The comment block immediately above a declaration, as its intent line.

    Languages without docstrings put the same information in a leading comment.
    Ignoring it would mean Go and TypeScript symbols carry no searchable prose,
    which is most of what makes natural-language search work at all.
    """
    ln = node.start_point[0]          # 0-indexed
    out = []
    i = ln - 1
    while i >= 0:
        s = lines[i].strip()
        if s.startswith(("///", "//", "#", "*", "/*", "--", "{$", "{")):
            body = s.lstrip("/#*-{$ ").rstrip("*/}").strip()
            if body:
                out.append(body)
            i -= 1
            continue
        break
    if not out:
        return ""
    return " ".join(reversed(out))[:120]


def _extract_treesitter(path: str, text: str, symbol_cls) -> Extract:
    ts_lang, _ = EXT_LANG[Path(path).suffix]
    src = text.encode("utf8")
    tree = _parser(ts_lang).parse(src)
    lines = text.splitlines()

    symbols, calls, notes = [], [], []
    if tree.root_node.has_error:
        notes.append("parse recovered from a syntax error; some spans may be short")

    def walk(node, parent: str | None, enclosing: str | None):
        kind = DECL_TYPES.get(node.type)
        name = None
        if kind:
            name, owner = _decl_name(node, src)
            # Delphi writes `type TCatalog = class(TObject) ... end` — the node
            # that carries the name is the type declaration and the node that
            # says "class" is nested inside it, so the kind has to be read from
            # the child or every Delphi class is filed as a plain type.
            if kind == "type" and any(c.type == "declClass" for c in node.children):
                kind = "class"
            if name:
                symbols.append(symbol_cls(
                    name=name, kind=kind,
                    line_start=node.start_point[0] + 1,
                    line_end=node.end_point[0] + 1,
                    signature=_signature(node, src),
                    intent=_doc_comment(node, src, lines),
                    parent=owner or parent,
                    complexity=_ts_complexity(node),
                ))
        if node.type in CALL_TYPES:
            callee = _callee_name(node, src)
            if callee:
                calls.append(CallSite(enclosing, callee, node.start_point[0] + 1))

        # Only a container renames `parent` for its children; a function's inner
        # closures stay attributed to the function, which is what a reader means
        # by "who calls this".
        next_parent = name if (kind in _CONTAINER and name) else parent
        next_enclosing = name if (kind and name and kind not in _CONTAINER) else enclosing
        for child in node.children:
            walk(child, next_parent, next_enclosing)

    walk(tree.root_node, None, None)
    symbols = _dedup(symbols)
    symbols.sort(key=lambda s: (s.line_start, s.name))
    return Extract(symbols=symbols, calls=calls, imports=_imports(text),
                   exact=True, notes=notes)


_PARAM_TYPES = ("parameters", "parameter_list", "formal_parameters", "declArgs",
                "argument_list", "function_value_parameters")


def _signature(node, src: bytes) -> str:
    params = node.child_by_field_name("parameters") or node.child_by_field_name("parameter_list")
    if params is None:
        for child in node.children:
            if child.type in _PARAM_TYPES:
                params = child
                break
            # one level down, for wrapper nodes like Pascal's defProc
            for sub in child.children:
                if sub.type in _PARAM_TYPES:
                    params = sub
                    break
            if params is not None:
                break
    if params is None:
        return ""
    sig = _text(params, src).replace("\n", " ")
    sig = re.sub(r"\s+", " ", sig).strip()
    return sig[:160]


def _ts_complexity(node) -> int:
    """Branch count, as a proxy for how much a symbol is doing."""
    branchy = {"if_statement", "for_statement", "while_statement", "switch_statement",
               "case_statement", "try_statement", "catch_clause", "conditional_expression",
               "for_range_clause", "match_expression", "when_expression", "rescue",
               "type_switch_statement", "select_statement", "guard"}
    n = 0
    stack = [node]
    while stack:
        cur = stack.pop()
        if cur.type in branchy:
            n += 1
        stack.extend(cur.children)
    return n


_IMPORT_RE = re.compile(
    r"""(?:^\s*import\s+.*?from\s+['"](?P<js>[^'"]+)['"]"""
    r"""|^\s*import\s+['"](?P<bare>[^'"]+)['"]"""
    r"""|^\s*(?:use|require|include)\s+['"]?(?P<other>[\w:./\\-]+)"""
    r"""|^\s*uses\s+(?P<pas>[\w,\s.]+);)""",
    re.M | re.I)


def _imports(text: str) -> list:
    out = []
    for m in _IMPORT_RE.finditer(text):
        if m.group("pas"):
            out += [u.strip() for u in m.group("pas").split(",") if u.strip()]
        else:
            v = m.group("js") or m.group("bare") or m.group("other")
            if v:
                out.append(v.strip())
    # Go groups its imports in a parenthesised block that the line-oriented
    # pattern above cannot see.
    for block in re.findall(r"import\s*\(([^)]*)\)", text):
        out += re.findall(r"""['"]([^'"]+)['"]""", block)
    return sorted({o for o in out if o})[:40]


# --- python -------------------------------------------------------------------

def _py_complexity(node) -> int:
    n = 0
    for sub in ast.walk(node):
        if isinstance(sub, (ast.If, ast.For, ast.While, ast.Try, ast.With,
                            ast.ExceptHandler, ast.BoolOp, ast.IfExp, ast.comprehension)):
            n += 1
    return n


def _py_sig(node) -> str:
    try:
        a = [x.arg for x in node.args.args]
        if node.args.vararg:
            a.append("*" + node.args.vararg.arg)
        if node.args.kwarg:
            a.append("**" + node.args.kwarg.arg)
        return "(" + ", ".join(a) + ")"
    except Exception:
        return "(...)"


def _py_intent(node) -> str:
    doc = ast.get_docstring(node)
    return doc.strip().split("\n")[0].strip()[:120] if doc else ""


def _py_callee(node: ast.Call) -> str | None:
    f = node.func
    if isinstance(f, ast.Name):
        return f.id
    if isinstance(f, ast.Attribute):
        return f.attr
    return None


def extract_python(path: str, text: str, symbol_cls) -> Extract:
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError as e:
        return Extract([], [], [], False, [f"syntax error line {e.lineno}: {e.msg}"])

    imports, symbols, calls, bases = [], [], [], {}
    for node in tree.body:
        if isinstance(node, ast.Import):
            imports += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            imports.append(node.module or ".")

    def record_calls(node, enclosing):
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call):
                name = _py_callee(sub)
                if name:
                    calls.append(CallSite(enclosing, name, sub.lineno))

    def visit(scope, parent=None):
        for ch in scope.body:
            if isinstance(ch, (ast.FunctionDef, ast.AsyncFunctionDef)):
                symbols.append(symbol_cls(
                    name=ch.name, kind="method" if parent else "function",
                    line_start=ch.lineno, line_end=getattr(ch, "end_lineno", ch.lineno),
                    signature=_py_sig(ch), intent=_py_intent(ch), parent=parent,
                    complexity=_py_complexity(ch)))
                record_calls(ch, ch.name)
            elif isinstance(ch, ast.ClassDef):
                symbols.append(symbol_cls(
                    name=ch.name, kind="class", line_start=ch.lineno,
                    line_end=getattr(ch, "end_lineno", ch.lineno), signature="",
                    intent=_py_intent(ch), parent=parent, complexity=_py_complexity(ch)))
                bases[ch.name] = [b.id for b in ch.bases if isinstance(b, ast.Name)]
                visit(ch, ch.name)
            elif isinstance(ch, ast.Assign) and parent is None:
                for t in ch.targets:
                    if isinstance(t, ast.Name) and t.id.isupper():
                        symbols.append(symbol_cls(
                            name=t.id, kind="const", line_start=ch.lineno,
                            line_end=getattr(ch, "end_lineno", ch.lineno)))

    visit(tree)
    symbols.sort(key=lambda s: s.line_start)
    ex = Extract(symbols, calls, sorted(set(imports)), True, [])
    ex.bases = bases          # type: ignore[attr-defined]
    ex.module_intent = _py_intent(tree)   # type: ignore[attr-defined]
    return ex


def extract(path: str, text: str, symbol_cls) -> Extract:
    """Structure for one file, by extension. Never raises on bad input."""
    suffix = Path(path).suffix
    if suffix == ".py":
        return extract_python(path, text, symbol_cls)
    if suffix in EXT_LANG and treesitter_available():
        try:
            return _extract_treesitter(path, text, symbol_cls)
        except Exception as e:
            # A grammar crash must degrade to metadata, never take down an index
            # request that also contained 400 healthy files.
            return Extract([], [], _imports(text), False,
                           [f"parser failed ({type(e).__name__}); metadata only"])
    if suffix in EXT_LANG:
        return Extract([], [], _imports(text), False,
                       ["tree-sitter grammars not installed; metadata only"])
    return Extract([], [], [], False, ["no parser for this file type; use /read directly"])


def language_of(path: str) -> str:
    suffix = Path(path).suffix
    if suffix == ".py":
        return "python"
    if suffix in EXT_LANG:
        return EXT_LANG[suffix][1]
    return suffix.lstrip(".") or "text"
