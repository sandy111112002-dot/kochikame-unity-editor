#!/usr/bin/env python3
"""Build transparent, normalized Ryotsu attack frames and a horizontal sheet."""

from collections import deque
from pathlib import Path
import sys

from PIL import Image


CANVAS = 512
PADDING = 20


def remove_border_background(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    # Clipboard captures can include a 1–2 px dark crop rule (not artwork).
    image = image.crop((2, 2, image.width - 2, image.height - 4))
    pixels = image.load()
    width, height = image.size
    border = []
    for x in range(width):
        border.extend((pixels[x, 0][:3], pixels[x, height - 1][:3]))
    for y in range(height):
        border.extend((pixels[0, y][:3], pixels[width - 1, y][:3]))
    # Ignore dark scan/crop borders and derive the key from the brightest border pixels.
    samples = sorted(border, key=lambda rgb: sum(rgb), reverse=True)[: max(8, len(border) // 5)]
    key = tuple(sum(sample[channel] for sample in samples) / len(samples) for channel in range(3))

    def distance(x: int, y: int) -> float:
        rgb = pixels[x, y][:3]
        return sum((rgb[channel] - key[channel]) ** 2 for channel in range(3)) ** 0.5

    queue = deque()
    visited = bytearray(width * height)
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index] or distance(x, y) >= 54:
            continue
        visited[index] = 1
        d = distance(x, y)
        alpha = 0 if d <= 13 else round(255 * (d - 13) / 41)
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = (red, green, blue, alpha)
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return image


def normalize(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("background removal produced an empty frame")
    subject = image.crop(bbox)
    scale = min((CANVAS - 2 * PADDING) / subject.width, (CANVAS - 2 * PADDING) / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - subject.width) // 2
    y = CANVAS - PADDING - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def remove_red_annotations(image: Image.Image, frame_index: int) -> Image.Image:
    """Remove only the known annotation zones, preserving red facial details."""
    width, height = image.size
    zones = {
        3: (0, int(height * .35), int(width * .38), int(height * .68)),
        4: (int(width * .62), int(height * .35), width, int(height * .72)),
        5: (int(width * .65), 0, width, int(height * .68)),
    }
    zone = zones.get(frame_index)
    if not zone:
        return image
    left, top, right, bottom = zone
    pixels = image.load()
    for y in range(top, bottom):
        for x in range(left, right):
            red, green, blue, alpha = pixels[x, y]
            # Annotation reds (including pale antialiasing) keep green/blue close;
            # skin and the brown wooden sandal do not.
            annotation_red = red > 120 and red - green > 25 and abs(green - blue) < 32
            pale_annotation_edge = min(red, green, blue) > 130 and max(red, green, blue) - min(red, green, blue) < 48
            if annotation_red or pale_annotation_edge:
                pixels[x, y] = (red, green, blue, 0)
    return image


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit("usage: prepare_ryotsu_attack.py OUTPUT_DIR SOURCE...")
    output_dir = Path(sys.argv[1])
    remove_red = len(sys.argv) > 2 and sys.argv[2] == "--remove-red"
    sources = [Path(path) for path in sys.argv[3 if remove_red else 2:]]
    frames_dir = output_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, source in enumerate(sources, 1):
        extracted = remove_border_background(source)
        if remove_red:
            extracted = remove_red_annotations(extracted, index)
        frame = normalize(extracted)
        frame.save(frames_dir / f"frame-{index:02d}.png", optimize=True)
        frames.append(frame)
    sheet = Image.new("RGBA", (CANVAS * len(frames), CANVAS), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (CANVAS * index, 0))
    sheet.save(output_dir / "sheet.png", optimize=True)
    frames[0].save(output_dir / "static.png", optimize=True)


if __name__ == "__main__":
    main()
