#!/bin/sh
set -eu

node_bin=$(command -v node)
codex_bin=$(command -v codex)
if ! "$codex_bin" login status >/dev/null 2>&1; then
  echo "Sign in with your own Codex account using 'codex login', then rerun this installer." >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install_root="$HOME/Library/Application Support/TideLine/Voyage Muninn"
bridge_dest="$install_root/muninn-bridge.mjs"
plist_path="$HOME/Library/LaunchAgents/com.tideline.voyage-muninn.plist"
umask 077
mkdir -p "$install_root" "$HOME/Library/LaunchAgents"
cp "$script_dir/muninn-bridge.mjs" "$bridge_dest"

python3 - "$plist_path" "$node_bin" "$bridge_dest" "$codex_bin" "$install_root" <<'PY'
import plistlib
import sys
from pathlib import Path

plist_path, node_bin, bridge_dest, codex_bin, install_root = sys.argv[1:]
config = {
    "Label": "com.tideline.voyage-muninn",
    "ProgramArguments": [node_bin, bridge_dest],
    "EnvironmentVariables": {"CODEX_BIN": codex_bin},
    "WorkingDirectory": install_root,
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 30,
    "StandardOutPath": str(Path(install_root) / "bridge.log"),
    "StandardErrorPath": str(Path(install_root) / "bridge-error.log"),
}
Path(plist_path).write_bytes(plistlib.dumps(config))
PY

launchctl bootout "gui/$(id -u)" "$plist_path" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl kickstart "gui/$(id -u)/com.tideline.voyage-muninn"
echo "Muninn's local Codex connector is installed for this macOS user."
