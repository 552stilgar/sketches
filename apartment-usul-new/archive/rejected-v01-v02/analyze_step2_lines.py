from pathlib import Path

import numpy as np
from PIL import Image


PROJECT = Path(__file__).resolve().parent
WORKSPACE = PROJECT.parent
SOURCE = WORKSPACE / "tmp" / "pdfs" / "hires" / "baseline.png"
gray = np.array(Image.open(SOURCE).convert("L"))


def longest_run(mask):
    best = start = end = 0
    current_start = None
    for i, value in enumerate(mask):
        if value and current_start is None:
            current_start = i
        elif not value and current_start is not None:
            length = i - current_start
            if length > best:
                best, start, end = length, current_start, i - 1
            current_start = None
    if current_start is not None and len(mask) - current_start > best:
        best, start, end = len(mask) - current_start, current_start, len(mask) - 1
    return best, start, end


def clusters(values):
    result = []
    current = []
    for item in values:
        if current and item[0] > current[-1][0] + 1:
            result.append(current)
            current = []
        current.append(item)
    if current:
        result.append(current)
    return result


vertical = []
for x in range(1100, 5800):
    length, y0, y1 = longest_run(gray[880:3000, x] < 45)
    if length >= 230:
        vertical.append((x, length, y0 + 880, y1 + 880))

horizontal = []
for y in range(880, 3000):
    length, x0, x1 = longest_run(gray[y, 1100:5800] < 45)
    if length >= 320:
        horizontal.append((y, length, x0 + 1100, x1 + 1100))

print("VERTICAL CLUSTERS")
for group in clusters(vertical):
    best = max(group, key=lambda row: row[1])
    print(f"x={group[0][0]}..{group[-1][0]} best={best}")

print("HORIZONTAL CLUSTERS")
for group in clusters(horizontal):
    best = max(group, key=lambda row: row[1])
    print(f"y={group[0][0]}..{group[-1][0]} best={best}")
