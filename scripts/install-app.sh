#!/bin/bash
# Installs OpenRouter Studio as a launchd LaunchAgent so it auto-starts at login
# and runs in the background. Visit http://localhost:3030 to use it.
#
# By default runs `next dev` so code edits hot-reload into the dock app
# (no rebuild needed — just save the file). Pass MODE=prod to use a built
# `next start` instead (faster, but you'll have to re-run this installer
# to pick up code changes).
#
# Usage:  ./scripts/install-app.sh         # dev mode (HMR, default)
#         MODE=prod ./scripts/install-app.sh  # built prod mode
# Remove: ./scripts/uninstall-app.sh

set -euo pipefail

LABEL="com.openrouter-studio"
PORT="${PORT:-3030}"
MODE="${MODE:-dev}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$PROJECT_DIR/.app-logs"
START_SCRIPT="$PROJECT_DIR/scripts/start-server.sh"
UID_NUM="$(id -u)"

if [ "$MODE" != "dev" ] && [ "$MODE" != "prod" ]; then
  printf '\033[31m%s\033[0m\n' "MODE must be 'dev' or 'prod' (got: $MODE)" >&2
  exit 1
fi

bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*" >&2; }

# 1. Sanity checks
if ! command -v node >/dev/null; then
  red "Node not found in PATH. Install Node 18+ (e.g. \`brew install node\` or via nvm) and retry."
  exit 1
fi
if ! command -v npm >/dev/null; then
  red "npm not found in PATH."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
  red ".env.local missing in $PROJECT_DIR. Copy .env.example and set OPENROUTER_API_KEY first."
  exit 1
fi

if [ "$MODE" = "prod" ]; then
  bold "==> Building production bundle (MODE=prod)"
  ( cd "$PROJECT_DIR" && npm run build )
else
  bold "==> Skipping build (MODE=dev — next dev will hot-reload on save)"
fi

bold "==> Preparing log directory"
mkdir -p "$LOG_DIR"

bold "==> Making start script executable"
chmod +x "$START_SCRIPT"

bold "==> Writing LaunchAgent plist"
mkdir -p "$HOME/Library/LaunchAgents"

# Capture current PATH so launchd can find node/npm
CURRENT_PATH="$PATH"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$START_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$CURRENT_PATH</string>
    <key>PORT</key>
    <string>$PORT</string>
    <key>MODE</key>
    <string>$MODE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/stderr.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

bold "==> Loading LaunchAgent"
# Bootout if already loaded so we pick up the new plist
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_PATH"
launchctl enable "gui/$UID_NUM/$LABEL"
launchctl kickstart -k "gui/$UID_NUM/$LABEL"

# Wait briefly for the server to start.
# next dev takes a few seconds longer to first-respond than next start.
URL="http://localhost:$PORT"
TIMEOUT=$([ "$MODE" = "dev" ] && echo 60 || echo 30)
green "==> Waiting for server to come up at $URL (mode=$MODE)"
for i in $(seq 1 "$TIMEOUT"); do
  if curl -sf -o /dev/null "$URL"; then
    green "==> Server is up."
    break
  fi
  sleep 0.5
  if [ "$i" -eq "$TIMEOUT" ]; then
    yellow "Server didn't respond within ${TIMEOUT}s. Check logs:"
    yellow "  tail -f $LOG_DIR/stderr.log"
    exit 1
  fi
done

MODE_NOTE=""
if [ "$MODE" = "dev" ]; then
  MODE_NOTE="Mode:   dev (next dev) — code edits hot-reload automatically.
          The dock window picks up changes on save; no rebuild needed."
else
  MODE_NOTE="Mode:   prod (next start) — serves the static build at $PROJECT_DIR/.next.
          To pick up code changes, re-run \`./scripts/install-app.sh\`."
fi

cat <<EOF

$(green "Installed.") The server will start automatically at every login.

  URL:    $URL
  $MODE_NOTE
  Logs:   $LOG_DIR/stdout.log
          $LOG_DIR/stderr.log
  Plist:  $PLIST_PATH

To get a real "Mac app" feel:
  1. Open $URL in Safari (macOS Sonoma 14+).
  2. Safari menu: File → Add to Dock…
  3. Confirm. You'll get a dock icon that opens the app in its own
     standalone window — looks and behaves like a native app.

If your dock window doesn't reflect a code change in dev mode, give the
HMR websocket a second to reconnect, or hit Cmd+R inside the dock window.

To stop / remove:        ./scripts/uninstall-app.sh
To restart the server:   launchctl kickstart -k gui/$UID_NUM/$LABEL
To switch to prod mode:  MODE=prod ./scripts/install-app.sh

EOF
