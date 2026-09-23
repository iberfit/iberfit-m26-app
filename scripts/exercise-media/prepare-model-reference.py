#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image, ImageOps

MAX_DIMENSION = 511


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--max-size', type=int, default=MAX_DIMENSION)
    args = parser.parse_args()

    if args.max_size < 64 or args.max_size >= 512:
        raise SystemExit('MODEL_REFERENCE_MAX_SIZE_INVALID')

    src = Path(args.input)
    dst = Path(args.output)
    if not src.is_file():
        raise SystemExit('MODEL_REFERENCE_INPUT_MISSING')

    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((args.max_size, args.max_size), Image.Resampling.LANCZOS)
        width, height = image.size
        if width >= 512 or height >= 512:
            raise SystemExit('MODEL_REFERENCE_DIMENSIONS_INVALID')
        image.save(dst, 'PNG', optimize=True)

    print(f'{dst}|{width}x{height}')


if __name__ == '__main__':
    main()
