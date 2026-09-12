#!/usr/bin/env python3
"""Create the deterministic IBERFIT standing hip-abduction end-pose guide v3.

The guide intentionally stops at the moving ankle. It must not encode shoe
orientation because FLUX was interpreting the old moving-foot stroke as a
shoe sole pointing toward the camera.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH = 256
HEIGHT = 512
VERSION = "v3-32deg-ankle-only"
TARGET_DEGREES = 32
ANGLE_MIN = 31.5
ANGLE_MAX = 33.5


def build_pose(target: Path) -> dict[str, object]:
    image = Image.new("RGB", (WIDTH, HEIGHT), (240, 240, 238))
    draw = ImageDraw.Draw(image)
    bone = (25, 25, 25)
    joint = (80, 160, 100)
    outline = (15, 15, 15)

    # Head / torso / arms: neutral front-facing instructional silhouette.
    draw.ellipse((104, 28, 152, 76), fill=(210, 210, 205), outline=outline, width=4)
    draw.line((128, 76, 128, 96), fill=bone, width=12)
    draw.line((88, 108, 168, 108), fill=bone, width=18)
    draw.polygon([(105, 104), (151, 104), (146, 245), (110, 245)], fill=(185, 185, 180), outline=outline)
    for points in [((94, 115), (82, 195), (78, 285)), ((162, 115), (174, 195), (178, 285))]:
        draw.line(points, fill=bone, width=16, joint="curve")
    for x in (78, 178):
        draw.ellipse((x - 8, 277, x + 8, 293), fill=bone)

    left_hip = (115, 255)
    right_hip = (141, 255)
    support_knee = (147, 350)
    support_ankle = (151, 454)

    # ~32 degree frontal-plane abduction with a long, nearly straight moving leg.
    moving_knee = (64, 332)
    moving_ankle = (20, 404)

    draw.line((108, 250, 148, 250), fill=bone, width=20)
    draw.line([right_hip, support_knee, support_ankle], fill=bone, width=24, joint="curve")
    draw.line([left_hip, moving_knee, moving_ankle], fill=bone, width=24, joint="curve")

    # Support shoe is allowed because it is flat on the floor and unambiguous.
    draw.line((145, 458, 171, 464), fill=bone, width=18)
    # IMPORTANT: no moving-foot/shoe stroke. The guide terminates at the ankle.

    joints = [
        (128, 108), (88, 108), (168, 108), (82, 195), (174, 195),
        left_hip, right_hip, moving_knee, support_knee, moving_ankle, support_ankle,
    ]
    for x, y in joints:
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=joint, outline=outline, width=2)

    draw.line((128, 15, 128, 480), fill=(205, 205, 200), width=2)
    draw.line((4, 474, 236, 474), fill=(120, 120, 120), width=3)

    dx = left_hip[0] - moving_ankle[0]
    dy = moving_ankle[1] - left_hip[1]
    angle = math.degrees(math.atan2(dx, dy))
    if not ANGLE_MIN <= angle <= ANGLE_MAX:
        raise RuntimeError(f"IBERFIT_POSE_GUIDE_ANGLE_INVALID:{angle:.4f}")
    if moving_ankle[1] >= 440:
        raise RuntimeError("IBERFIT_POSE_GUIDE_ANKLE_NOT_SUSPENDED")
    if moving_ankle[0] >= moving_knee[0] >= left_hip[0]:
        raise RuntimeError("IBERFIT_POSE_GUIDE_LATERAL_GEOMETRY_INVALID")

    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=False)

    return {
        "schema": "iberfit.exercise.pose-guide.v1",
        "version": VERSION,
        "exercise_id": "IBF-ABDUCCION-DE-CADERA-LATERAL",
        "width": WIDTH,
        "height": HEIGHT,
        "target_abduction_degrees": TARGET_DEGREES,
        "actual_abduction_degrees": round(angle, 4),
        "moving_foot_geometry": "omitted",
        "moving_ankle_suspended": True,
        "coronal_plane_only": True,
        "output": str(target),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        default="recovery/exercise-media-pose-guides/hip-abduction-end-pose-v3-32deg-ankle-only.png",
    )
    parser.add_argument("--metadata-out", default="")
    args = parser.parse_args()

    metadata = build_pose(Path(args.out))
    if args.metadata_out:
        metadata_path = Path(args.metadata_out)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
