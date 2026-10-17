#!/usr/bin/env bash
# Builds the three mandatory CrazyGames cover images from the raw artwork.
#
#   Landscape  16:9   1920x1080
#   Portrait   2:3     800x1200
#   Square     1:1     800x800
#
# The title is rendered with ImageMagick (not by the image model) so the
# typography is crisp and spelled exactly right — CrazyGames only allows the
# game's title on the cover.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CD="$ROOT/release/covers"
RAW="$ROOT/assets/covers"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

CYAN='#00E5FF'
MINT='#54F7C5'

TRACKING_RATIO=15   # letter spacing as a percentage of the point size
SUB_RATIO=44        # "LAST CORE" size as a percentage of the main line

# fit_size <text> <target-width> <max-size>
# Binary-searches the largest point size whose rendered text fits the width.
fit_size() {
  local text=$1 target_w=$2 max_size=$3
  local lo=8 hi=$max_size best=8 mid w kerning
  while [ "$lo" -le "$hi" ]; do
    mid=$(( (lo + hi) / 2 ))
    kerning=$(( mid * TRACKING_RATIO / 100 ))
    w=$(convert -size 8000x600 xc:none -font "$FONT" -pointsize "$mid" -kerning "$kerning" \
          -fill white -gravity northwest -annotate +50+200 "$text" -trim -format '%w' info: 2>/dev/null || echo 99999)
    if [ "$w" -le "$target_w" ]; then
      best=$mid
      lo=$(( mid + 1 ))
    else
      hi=$(( mid - 1 ))
    fi
  done
  echo "$best"
}

# make_cover <raw> <out> <W> <H> <crop-x> <crop-y> <crop-w> <crop-h> <max-size>
make_cover() {
  local raw=$1 out=$2 W=$3 H=$4 cx=$5 cy=$6 cw=$7 ch=$8 max_size=${9}

  local tmp; tmp="$(mktemp -d)"

  # 1. crop to the target aspect ratio, then scale to the exact pixel size
  convert "$RAW/$raw" -crop "${cw}x${ch}+${cx}+${cy}" +repage \
          -filter Lanczos -resize "${W}x${H}!" "$tmp/bg.png"

  # 2. soft dark scrim in the lower third so the title always reads
  local scrim_h=$(( H * 38 / 100 ))
  local scrim_y=$(( H - scrim_h ))
  convert -size "${W}x${scrim_h}" gradient:'rgba(7,11,23,0)'-'rgba(7,11,23,0.92)' "$tmp/scrim.png"
  convert "$tmp/bg.png" "$tmp/scrim.png" -geometry "+0+${scrim_y}" -composite "$tmp/bg2.png"

  # 3. title layer: two lines, wide tracking, cyan + mint
  local target_w=$(( W * 88 / 100 ))
  local s1 s2 k1 k2 y1 y2
  s1=$(fit_size 'HEX DEFENDER' "$target_w" "$max_size")
  s2=$(( s1 * SUB_RATIO / 100 ))
  k1=$(( s1 * TRACKING_RATIO / 100 ))
  k2=$(( s2 * TRACKING_RATIO / 100 ))
  y1=$(( s1 * 70 / 100 ))
  y2=$(( s1 * 37 / 100 ))

  convert -size "${W}x${H}" xc:none \
          -font "$FONT" -pointsize "$s1" -kerning "$k1" -fill "$CYAN" \
          -gravity south -annotate "+0+${y1}" 'HEX DEFENDER' \
          -font "$FONT" -pointsize "$s2" -kerning "$k2" -fill "$MINT" \
          -gravity south -annotate "+0+${y2}" 'LAST CORE' \
          "$tmp/title.png"

  # 4. glow pass: blurred copy composited under the sharp text
  convert "$tmp/title.png" -channel RGBA -blur 0x14 "$tmp/glow.png"
  convert "$tmp/bg2.png" "$tmp/glow.png" -gravity south -composite "$tmp/step.png"
  convert "$tmp/step.png" "$tmp/title.png" -gravity south -composite "$CD/$out"

  echo "  $out  $(identify -format '%wx%h' "$CD/$out")  title ${s1}px"
  rm -rf "$tmp"
}

mkdir -p "$CD" "$RAW"

echo 'Building CrazyGames covers:'

# raw-landscape is 1536x1024 -> crop 1536x864 (16:9) keeping the core high
make_cover raw-landscape.png cover-landscape.png 1920 1080 0 0 1536 864 200

# raw-portrait is 864x1821 -> crop 864x1296 (2:3)
make_cover raw-portrait.png cover-portrait.png 800 1200 0 0 864 1296 120

# raw-square is 1254x1254 -> square
make_cover raw-square.png cover-square.png 800 800 0 0 1254 1254 120

echo 'Done.'
