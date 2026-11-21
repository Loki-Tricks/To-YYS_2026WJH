"""Restore the pinned browser runtime, including the SQLite lesson package."""
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen
from shutil import copyfileobj

DIRECTORY = Path(__file__).resolve().parent / "pyodide"
BASE = "https://gcore.jsdelivr.net/pyodide/v0.25.0/full/"
HASHES = {
    "pyodide.js": "9c79c9999999b15de7587aa220c61d06aa14e76babb75dc50c2f873aa826ad4d",
    "pyodide.asm.js": "e0ee644201404183c666d402925f78998dfa1b1ad99415baef6833b17b082397",
    "pyodide.asm.wasm": "3694754429c57aff83cf3f8592d83085e8e5edd7ed52e97fbb9ff9065d698ef4",
    "pyodide-lock.json": "3782b60f746823bed3aaac9bb732e5bda226085c6c39649dc64caad2c816fc92",
    "python_stdlib.zip": "ca76f51f97772dd3a011b4ca1a2a0062a9aecf1feb9bd77342d3cdbdeb45d33f",
    "sqlite3-1.0.0.zip": "eacd30149e4a156940586c086d7837dfa21bd8027a7c50013808372be573b40e",
}


def restore(name, digest):
    dest = DIRECTORY / name
    if dest.is_file() and sha256(dest.read_bytes()).hexdigest() == digest:
        print(f"校验通过：{name}")
        return
    with NamedTemporaryFile(dir=DIRECTORY, delete=False) as temp:
        staged = Path(temp.name)
    try:
        with urlopen(BASE + name, timeout=45) as response, staged.open("wb") as output:
            copyfileobj(response, output)
        if sha256(staged.read_bytes()).hexdigest() != digest:
            raise ValueError(f"校验失败：{name}")
        staged.replace(dest)
        print(f"已恢复：{name}")
    finally:
        staged.unlink(missing_ok=True)


if __name__ == "__main__":
    DIRECTORY.mkdir(exist_ok=True)
    for filename, checksum in HASHES.items():
        restore(filename, checksum)
