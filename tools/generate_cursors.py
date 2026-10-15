"""Pixel-art mouse cursors for 팔팔마을 (16x16 art, saved at 2x = 32x32).

Run:  python tools/generate_cursors.py   -> game/cursors/*.png
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "game", "cursors")
SCALE = 2

PALETTE = {
    "#": (58, 36, 24, 255),     # outline (dark wood)
    "o": (255, 244, 220, 255),  # glove / arrow fill (cream)
    "s": (224, 192, 138, 255),  # shade
    "r": (201, 75, 60, 255),    # cuff (red)
    "R": (150, 50, 40, 255),    # cuff shade
    ".": (0, 0, 0, 0),
}

CURSORS = {
    # name: (rows, hotspot in art pixels)
    "arrow": ([
        "#...............",
        "##..............",
        "#o#.............",
        "#oo#............",
        "#ooo#...........",
        "#oooo#..........",
        "#ooooo#.........",
        "#oooooo#........",
        "#ooooooo#.......",
        "#oooosss#.......",
        "#oo#os##........",
        "#o#.#os#........",
        "##..#os#........",
        "#....#os#.......",
        ".....#ss#.......",
        "......##........",
    ], (0, 0)),
    "pointer": ([
        ".....##.........",
        "....#oo#........",
        "....#oo#........",
        "....#oo#........",
        "....#oo###......",
        "....#oo#oo##....",
        "..#.#oo#oo#o##..",
        ".#o##oo#oo#oo#..",
        ".#oo#oooooooo#..",
        "..#oooooooooso#.",
        "..#oooooooooos#.",
        "...#ooooooooss#.",
        "...#oooooooss#..",
        "....#rrrrrrrR#..",
        "....#rrrrrrRR#..",
        ".....#########..",
    ], (5, 0)),
    "grab": ([
        "................",
        "....##.##.......",
        "...#oo#oo#.##...",
        "...#oo#oo##oo#..",
        ".##.#oo#oo#oo#..",
        "#oo##oo#oo#oo#..",
        "#ooo#oo#oo#oo#..",
        ".#ooooooooooos#.",
        "..#oooooooooos#.",
        "..#ooooooooos#..",
        "...#ooooooooss#.",
        "...#oooooooss#..",
        "....#rrrrrrrR#..",
        "....#rrrrrrRR#..",
        ".....#########..",
        "................",
    ], (7, 7)),
    "grabbing": ([
        "................",
        "................",
        "................",
        "....##.##.##....",
        "...#oo#oo#oo##..",
        "..##oo#oo#oo#o#.",
        ".#o#ooooooooo#o#",
        ".#oooooooooooos#",
        "..#ooooooooooos#",
        "..#ooooooooooss#",
        "...#ooooooooss#.",
        "....#rrrrrrrR#..",
        "....#rrrrrrRR#..",
        ".....#########..",
        "................",
        "................",
    ], (7, 7)),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (rows, hot) in CURSORS.items():
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        for y, row in enumerate(rows):
            for x, ch in enumerate(row.ljust(16, ".")[:16]):
                img.putpixel((x, y), PALETTE[ch])
        img.resize((16 * SCALE, 16 * SCALE), Image.NEAREST).save(os.path.join(OUT, f"{name}.png"))
        print(f"{name}.png  hotspot {hot[0] * SCALE} {hot[1] * SCALE}")


if __name__ == "__main__":
    main()
