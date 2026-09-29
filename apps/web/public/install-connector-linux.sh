#!/usr/bin/env sh
# Techlio connector for Linux (Ubuntu, Debian, Fedora, Arch, WSL, …).
#
#   curl -fsSL https://techlio-pulse.vercel.app/install-connector-linux.sh | sh
#
# Installs for the current user only — no sudo. Downloads the connector for
# this CPU, verifies its SHA-256 checksum, then runs it once: it copies itself
# to ~/.techlio/connector and starts as a systemd user service (or at sign-in
# through ~/.config/autostart where systemd is not available).
set -eu

SITE="${TECHLIO_SITE:-https://techlio-pulse.vercel.app}"

case "$(uname -s)" in
  Linux) ;;
  *) echo "This installer is for Linux. Download the macOS or Windows connector from $SITE instead." >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Unsupported processor: $(uname -m). The connector supports x86_64 and arm64." >&2; exit 1 ;;
esac

FILE="techlio-connector-linux-$ARCH.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    echo "Install curl or wget, then run this again." >&2
    exit 1
  fi
}

echo "Downloading the Techlio connector for Linux ($ARCH)…"
fetch "$SITE/downloads/$FILE" "$TMP/$FILE"
fetch "$SITE/downloads/SHA256SUMS.txt" "$TMP/SHA256SUMS.txt"

EXPECTED="$(grep "  $FILE\$" "$TMP/SHA256SUMS.txt" | cut -d' ' -f1 || true)"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP/$FILE" | cut -d' ' -f1)"
else
  ACTUAL="$(shasum -a 256 "$TMP/$FILE" | cut -d' ' -f1)"
fi
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Checksum check failed for $FILE — the download is incomplete or was changed. Nothing was installed." >&2
  exit 1
fi

tar -xzf "$TMP/$FILE" -C "$TMP"
chmod +x "$TMP/techlio-connector"

# Installs itself as a background service, starts it, and reports what happened.
"$TMP/techlio-connector"

echo ""
echo "Next: open $SITE → My connectors, paste the device ID and token your administrator gave you, and activate."
