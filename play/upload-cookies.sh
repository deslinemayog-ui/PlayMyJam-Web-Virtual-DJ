#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="sublime-calling-507411-e0"
REGIONS=("africa-south1" "europe-west1")
SERVICE_NAME="play-server"
SECRET_NAME="ytdlp-cookies"
STATE_BUCKET="play-server-ytdlp-state-371330410186"

if [ $# -lt 1 ]; then
  echo "Usage: ./play/upload-cookies.sh path/to/cookies.txt"
  exit 1
fi

COOKIES_PATH="$1"
if [ ! -f "$COOKIES_PATH" ]; then
  echo "Error: File not found: $COOKIES_PATH"
  exit 1
fi

TMP_NETSCAPE="$(mktemp /tmp/ytdlp-netscape-XXXXXX.txt)"
trap 'rm -f "$TMP_NETSCAPE"' EXIT

# Convert JSON cookie exports (e.g. Cookie-Editor / EditThisCookie) to Netscape format if needed
node -e '
const fs = require("fs");
const inputPath = process.argv[1];
const outputPath = process.argv[2];
const raw = fs.readFileSync(inputPath, "utf8").trim();

if (raw.startsWith("[") || raw.startsWith("{")) {
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.cookies) ? parsed.cookies : []);
  if (!list.length) {
    console.error("Error: JSON cookies file contains no cookies.");
    process.exit(1);
  }
  const lines = ["# Netscape HTTP Cookie File", "# Converted from JSON export for yt-dlp", ""];
  let count = 0;
  for (const c of list) {
    if (!c || !c.domain || !c.name) continue;
    const domain = String(c.domain).trim();
    const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
    const cookiePath = String(c.path || "/").trim() || "/";
    const secure = c.secure ? "TRUE" : "FALSE";
    let exp = Number(c.expirationDate ?? c.expires ?? c.expiry ?? 0);
    if (!Number.isFinite(exp) || exp < 0) exp = 0;
    if (exp > 1e12) exp = Math.floor(exp / 1000);
    else exp = Math.floor(exp);
    const name = String(c.name).replace(/[\t\r\n]/g, "");
    const value = String(c.value ?? "").replace(/[\t\r\n]/g, "");
    lines.push([domain, includeSubdomains, cookiePath, secure, String(exp), name, value].join("\t"));
    count++;
  }
  fs.writeFileSync(outputPath, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`Converted ${count} JSON cookies to Netscape format.`);
} else {
  fs.writeFileSync(outputPath, raw + "\n", { mode: 0o600 });
  const count = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  console.log(`Using Netscape cookies file (${count} entries).`);
}
' "$COOKIES_PATH" "$TMP_NETSCAPE"

echo "Uploading Netscape cookies to Secret Manager ($SECRET_NAME)..."
gcloud secrets versions add "$SECRET_NAME" \
  --data-file="$TMP_NETSCAPE" \
  --project="$PROJECT_ID"

# Clear any older rotated state in GCS so the fresh secret takes effect immediately
gcloud storage rm "gs://$STATE_BUCKET/ytdlp-cookies.json" --project="$PROJECT_ID" --quiet 2>/dev/null || true

UPDATED_AT="$(date +%s)"
for REGION in "${REGIONS[@]}"; do
  echo "Refreshing Cloud Run service ($SERVICE_NAME in $REGION) so new instances pick up the latest cookies..."
  gcloud run services update "$SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --update-env-vars="YTDLP_COOKIES_UPDATED_AT=$UPDATED_AT,YTDLP_COOKIES_STATE_BUCKET=$STATE_BUCKET" \
    --quiet
done

echo "Done! Checking live status (Johannesburg)..."
curl -sS "https://play-server-371330410186.africa-south1.run.app/api/tiktok/health"
echo ""
