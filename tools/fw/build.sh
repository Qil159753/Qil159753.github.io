#!/bin/sh
# Compile the ABU controller and robot sketches, unchanged, to WebAssembly for the qOS `fw` app.
# The sketches live in the private Abu_robocon_2026 repo; only the compiled .wasm is published.
#   sh tools/fw/build.sh [path/to/Abu_robocon_2026]
set -e
SRC=${1:-$HOME/Documents/GitHub/Abu_robocon_2026}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$HERE/../../qos/fw
mkdir -p "$OUT"
build() {   # sketch, probe, output name
  em++ -O2 -std=gnu++17 -fno-exceptions -fno-rtti -I"$HERE/shim" -DSKETCH="\"$SRC/$1\"" \
    -x c++ "$HERE/$2" -x none "$HERE/shim/core.cpp" \
    -sSTANDALONE_WASM --no-entry -sERROR_ON_UNDEFINED_SYMBOLS=0 -sINITIAL_MEMORY=1MB -sSTACK_SIZE=64KB \
    -sALLOW_MEMORY_GROWTH=0 -o "$OUT/$3.wasm"
  echo "$3.wasm $(wc -c < "$OUT/$3.wasm") bytes  <- $1"
}
build Controller_v7.ino probe_controller.cpp controller
build robot_firmware_v7.ino probe_robot.cpp robot
