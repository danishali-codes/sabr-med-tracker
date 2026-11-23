"""Draws Sabr's icon (a heart split by a wave into white and green, on purple) into assets/
and the website.

The same mark as website/public/favicon.svg and the watch's ic_launcher.xml. On light
backgrounds the white half becomes purple; the green stays the same. Run: python3 scripts/make-icons.py (needs Pillow).
"""
from PIL import Image, ImageDraw

PURPLE = '#6A4DF4'
WHITE = '#FFFFFF'
GREEN = '#3FD49A'
SS = 4  # draw big, then scale down for smooth edges

# The mark on a 64 x 64 grid, as cubic curves (same numbers as favicon.svg).
# The heart split by a wave that dips in like the left lobe and swings out like the right.
LEFT = [(32, 50), [(20, 42), (13, 34.5), (13, 26.5)], [(13, 20.5), (17.5, 16), (23, 16)], [(27, 16), (30.2, 18.3), (32, 21.5)],
        [(29.5, 24.5), (27.5, 27), (28, 30)], [(28.5, 33), (34, 33.5), (37, 36)], [(40, 38.5), (37, 44), (32, 50)]]
RIGHT = [(32, 21.5), [(33.8, 18.3), (37, 16), (41, 16)], [(46.5, 16), (51, 20.5), (51, 26.5)], [(51, 34.5), (44, 42), (32, 50)],
         [(37, 44), (40, 38.5), (37, 36)], [(34, 33.5), (28.5, 33), (28, 30)], [(27.5, 27), (29.5, 24.5), (32, 21.5)]]


def points(path, scale, dx, dy, steps=40):
    """Flattens a path of cubic curves into polygon points."""
    out = []
    x0, y0 = path[0]
    for (c1, c2, end) in path[1:]:
        for i in range(steps + 1):
            t = i / steps
            u = 1 - t
            x = u**3 * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * end[0]
            y = u**3 * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * end[1]
            out.append((x * scale + dx, y * scale + dy))
        x0, y0 = end
    return out


def mark(size, fraction=1.0, mono=False):
    """The split heart centred in a transparent square. fraction 1 = the favicon's proportions."""
    n = size * SS
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    scale = n / 64 * fraction
    off = n / 2 - 32 * scale
    # Monochrome icons are tinted by alpha, so the green half becomes a lighter shade.
    d.polygon(points(LEFT, scale, off, off), fill=WHITE)
    d.polygon(points(RIGHT, scale, off, off), fill=(255, 255, 255, 150) if mono else GREEN)
    return im.resize((size, size), Image.LANCZOS)


def on_square(size, radius=0):
    n = size * SS
    bg = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle([0, 0, n - 1, n - 1], radius=radius * SS, fill=PURPLE)
    bg = bg.resize((size, size), Image.LANCZOS)
    bg.alpha_composite(mark(size))
    return bg


# App icon (Android masks the corners itself).
on_square(1024).convert('RGB').save('assets/icon.png', optimize=True)
# Adaptive icon: the launcher shows roughly the middle 66%, so the mark is smaller here.
mark(512, 0.68).save('assets/android-icon-foreground.png', optimize=True)
Image.new('RGBA', (512, 512), PURPLE).save('assets/android-icon-background.png', optimize=True)
mark(432, 0.68, mono=True).save('assets/android-icon-monochrome.png', optimize=True)
mark(1024, 0.9).save('assets/splash-icon.png', optimize=True)
on_square(48, radius=12).save('assets/favicon.png', optimize=True)
# Website
on_square(180).convert('RGB').save('website/public/apple-touch-icon.png', optimize=True)
on_square(512, radius=128).save('website/public/icon-512.png', optimize=True)
print('icons written')
