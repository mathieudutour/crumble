#!/bin/sh
# Launch screens for iPhone and iPad. iOS shows a blank screen while a home-screen web app starts unless the page
# offers a `apple-touch-startup-image` that exactly matches the device's screen, so this draws one per screen size and
# theme (the app icon centred on the app's background) into public/splash/, and writes their <link> tags into
# index.html between the splash markers. Android builds its own from the web app manifest.
# Needs ImageMagick 7 (`magick`). Run from anywhere: sh scripts/splash.sh
set -eu
cd "$(dirname "$0")/.."

ICON=public/icon-512.png
LIGHT="#fbf6ef"
DARK="#1c1714"
# png: 256 colours, for a flat icon. jpg: for an icon with smooth gradients, which 256 colours would band.
FORMAT=jpg

# Screen size in CSS pixels and pixel ratio: current iPhones (portrait), then iPads (both orientations).
IPHONES="440x956@3 420x912@3 402x874@3 430x932@3 393x852@3 428x926@3 390x844@3 414x896@3 375x812@3 414x896@2 414x736@3 375x667@2"
IPADS="1032x1376@2 1024x1366@2 834x1210@2 834x1194@2 820x1180@2 834x1112@2 810x1080@2 744x1133@2 768x1024@2"

rm -rf public/splash
mkdir -p public/splash
links=$(mktemp)
# The icon with the rounded corners iOS gives app icons.
rounded=$(mktemp).png
magick "$ICON" -resize 512x512 \( -size 512x512 xc:black -fill white -draw "roundrectangle 0,0 511,511 115,115" \) \
  -alpha off -compose copy_opacity -composite "$rounded"

splash() { # width height ratio orientation
  w=$1 h=$2 r=$3 o=$4
  short=$(( w < h ? w : h ))
  size=$(( short * 30 / 100 )); [ "$size" -gt 128 ] && size=128
  for theme in light dark; do
    bg=$LIGHT; [ "$theme" = dark ] && bg=$DARK
    file="public/splash/${w}x${h}-${r}x-${theme}.$FORMAT"
    # Full-colour PNGs would weigh about 200 KB each.
    out="PNG8:$file" && opts="-dither None -colors 256"
    [ "$FORMAT" = jpg ] && out=$file && opts="-quality 90"
    magick -size "$((w * r))x$((h * r))" "xc:$bg" \( "$rounded" -resize "$((size * r))x$((size * r))" \) \
      -gravity center -geometry "+0-$((h * r / 20))" -composite -strip $opts "$out"
    dw=$w dh=$h; [ "$o" = landscape ] && dw=$h dh=$w
    echo "    <link rel=\"apple-touch-startup-image\" media=\"(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${o}) and (prefers-color-scheme: ${theme})\" href=\"/splash/${w}x${h}-${r}x-${theme}.$FORMAT\" />" >>"$links"
  done
}

for d in $IPHONES; do
  w=${d%%x*} rest=${d#*x} h=${rest%@*} r=${d#*@}
  splash "$w" "$h" "$r" portrait
done
for d in $IPADS; do
  w=${d%%x*} rest=${d#*x} h=${rest%@*} r=${d#*@}
  splash "$w" "$h" "$r" portrait
  splash "$h" "$w" "$r" landscape
done

# Replace what's between the markers in index.html with the new tags.
node -e '
  const fs = require("fs");
  const html = fs.readFileSync("index.html", "utf8");
  const links = fs.readFileSync(process.argv[1], "utf8");
  const start = "    <!-- splash:start (scripts/splash.sh) -->\n", end = "    <!-- splash:end -->";
  const before = html.includes(start) ? html.slice(0, html.indexOf(start)) : html.replace(/(\s*<\/head>)/, "\n").replace(/\n$/, "");
  const after = html.includes(start) ? html.slice(html.indexOf(end) + end.length) : html.slice(html.search(/\s*<\/head>/));
  fs.writeFileSync("index.html", (html.includes(start) ? before : before + "\n") + start + links + end + after);
' "$links"
rm -f "$links" "$rounded"
echo "$(ls public/splash | wc -l | tr -d " ") launch screens, $(du -sh public/splash | cut -f1)"
