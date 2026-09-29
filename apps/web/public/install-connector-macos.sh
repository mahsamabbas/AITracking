#!/usr/bin/env bash
# Techlio local connector — Node.js only, no repo clone.
set -euo pipefail

TECHLIO_SITE="${TECHLIO_SITE:-https://techlio-web.vercel.app}"
INSTALL_DIR="${TECHLIO_INSTALL_DIR:-$HOME/.techlio/connector}"
BUNDLE_URL="${TECHLIO_SITE}/downloads/techlio-connector.zip"

command -v node >/dev/null 2>&1 || {
  echo "Install Node.js 20 or newer from https://nodejs.org then run this script again."
  exit 1
}

echo "Installing Techlio connector to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
ENV_BACKUP=""
if [[ -f "$INSTALL_DIR/.env" ]]; then
  ENV_BACKUP="$(mktemp)"
  cp "$INSTALL_DIR/.env" "$ENV_BACKUP"
fi
TMPZIP="$(mktemp -t techlio-connector).zip"
curl -fsSL "$BUNDLE_URL" -o "$TMPZIP"
rm -rf "$INSTALL_DIR"/*
unzip -oq "$TMPZIP" -d "$INSTALL_DIR"
# zip root may be techlio-connector/ subfolder
if [[ -d "$INSTALL_DIR/techlio-connector" ]]; then
  mv "$INSTALL_DIR/techlio-connector"/* "$INSTALL_DIR/"
  rmdir "$INSTALL_DIR/techlio-connector" 2>/dev/null || rm -rf "$INSTALL_DIR/techlio-connector"
fi
rm -f "$TMPZIP"

if [[ -n "$ENV_BACKUP" ]]; then
  cp "$ENV_BACKUP" "$INSTALL_DIR/.env"
  rm -f "$ENV_BACKUP"
elif [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
fi

chmod +x "$INSTALL_DIR/run.sh"
RUNNER="$INSTALL_DIR/run.sh"
LABEL="com.techlio.connector"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.techlio-connector"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/.techlio-connector/connector.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/.techlio-connector/connector.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

ok=0
for _ in 1 2 3 4 5 6 7 8; do
  if curl -fsS "http://127.0.0.1:9477/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.5
done
if [[ "$ok" != 1 ]]; then
  echo "The connector did not start. See $HOME/.techlio-connector/connector.err.log"
  exit 1
fi

echo ""
echo "Done. Connector runs at http://127.0.0.1:9477"
echo "Open your Techlio dashboard → My connectors → Activate your key."
echo "Config: $INSTALL_DIR/.env"
