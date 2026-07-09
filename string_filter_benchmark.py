import random
import string
import time


TOTAL = 200_000
TARGET = "artist"
RATIO = 0.08
SEED = 20260629


def random_text(length=80):
    return "".join(random.choices(string.ascii_lowercase + "     ", k=length))


def build_data():
    random.seed(SEED)
    rows = []
    target_count = 0
    for i in range(TOTAL):
        text = random_text()
        if random.random() < RATIO:
            pos = random.randint(0, len(text))
            text = text[:pos] + TARGET + text[pos:]
            target_count += 1
        rows.append({
            "id": i,
            "name": f"item-{i}",
            "text": text,
        })
    return rows, target_count


def benchmark(rows):
    start = time.perf_counter()
    result = [row for row in rows if TARGET in row["text"]]
    elapsed = time.perf_counter() - start
    return result, elapsed


def benchmark_lowercase(rows):
    target = TARGET.lower()
    start = time.perf_counter()
    result = [row for row in rows if target in row["text"].lower()]
    elapsed = time.perf_counter() - start
    return result, elapsed


def main():
    build_start = time.perf_counter()
    rows, expected = build_data()
    build_elapsed = time.perf_counter() - build_start

    result, elapsed = benchmark(rows)
    lower_result, lower_elapsed = benchmark_lowercase(rows)

    print(f"rows: {len(rows):,}")
    print(f"expected matches: {expected:,}")
    print(f"case-sensitive matches: {len(result):,}, elapsed: {elapsed * 1000:.3f} ms")
    print(f"lowercase matches: {len(lower_result):,}, elapsed: {lower_elapsed * 1000:.3f} ms")
    print(f"data build elapsed: {build_elapsed * 1000:.3f} ms")


if __name__ == "__main__":
    main()
