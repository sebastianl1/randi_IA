import os

os.environ["OLLAMA_HOST"] = "http://127.0.0.1:1"
os.environ.setdefault("RANDI_DIR", str(__import__("pathlib").Path(__file__).parent.parent))
