#!/bin/bash
# Stops the OpenRouter Studio LaunchAgent and removes its plist.

set -euo pipefail

LABEL="com.openrouter-studio"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

bold "==> Unloading LaunchAgent"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true

if [ -f "$PLIST_PATH" ]; then
  rm -f "$PLIST_PATH"
  green "Removed $PLIST_PATH"
else
  green "Plist already absent."
fi

green "Done. The server will no longer auto-start."
