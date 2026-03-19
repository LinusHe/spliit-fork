#!/bin/sh
# Generate version.json + patch SW with build version

VERSION="${BUILD_VERSION:-0}"
HASH="${BUILD_HASH:-unknown}"
DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

# Generate version.json
cat > public/version.json <<EOF
{"version":${VERSION},"hash":"${HASH}","date":"${DATE}"}
EOF

# Patch service worker with version (forces browser to see it as new)
sed -i "s/__BUILD_VERSION__/${VERSION}-${HASH}/" public/sw.js

echo "Generated version.json + patched sw.js: v${VERSION} (${HASH})"
