#!/bin/sh
# Encode a rendered PNG sequence for the story: AVIF at full size in hd/, AVIF and WebP at 1280 wide.
# Usage: tools/blender/encode.sh PNG_DIR OUT_DIR   (needs avifenc and ffmpeg)
set -e
src=$1; out=$2
mkdir -p "$out/hd"
tmp=$(mktemp -d)
for f in "$src"/f*.png; do
  b=$(basename "${f%.png}")
  avifenc -q 38 -s 6 -j all "$f" "$out/hd/$b.avif" >/dev/null
  ffmpeg -loglevel error -y -i "$f" -vf scale=1280:-2:flags=lanczos "$tmp/$b.png"
  avifenc -q 40 -s 6 -j all "$tmp/$b.png" "$out/$b.avif" >/dev/null
  ffmpeg -loglevel error -y -i "$tmp/$b.png" -c:v libwebp -quality 68 "$out/$b.webp"
done
rm -rf "$tmp"
