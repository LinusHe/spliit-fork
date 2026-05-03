#!/bin/bash
set -euo pipefail

SPLIIT_APP_NAME=$(node -p -e "require('./package.json').name")
SPLIIT_VERSION=$(node -p -e "require('./package.json').version")
BUILD_VERSION=$(git rev-list --count HEAD 2>/dev/null || echo 0)
BUILD_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_DATE=$(git show -s --format=%cI HEAD 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

# we need to set dummy data for POSTGRES env vars in order for build not to fail
docker buildx build \
    --network=host \
    --build-arg BUILD_VERSION=${BUILD_VERSION} \
    --build-arg BUILD_HASH=${BUILD_HASH} \
    --build-arg BUILD_DATE=${BUILD_DATE} \
    -t ${SPLIIT_APP_NAME}:${SPLIIT_VERSION} \
    -t ${SPLIIT_APP_NAME}:latest \
    -t spliit-custom \
    .

docker image prune -f
