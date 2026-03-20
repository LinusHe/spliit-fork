# Spliit Fork — Deploy Guide

## Build & Deploy

`docker compose build` hat Netzwerkprobleme (npm kann registry nicht erreichen).
Deshalb: **Immer mit `docker build --network host` bauen!**

```bash
cd /docker/spliit/spliit-fork

# Build mit Version aus Git
DOCKER_BUILDKIT=1 docker build --network host --no-cache \
  --build-arg BUILD_VERSION=$(git rev-list --count HEAD) \
  --build-arg BUILD_HASH=$(git rev-parse --short HEAD) \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t spliit-custom:latest .

# Container neustarten (compose file liegt eine Ebene höher!)
cd /docker/spliit
docker compose up -d spliit
```

### ⚠️ Wichtig

- **Build-Args nicht vergessen!** Ohne sie steht `v0 (unknown)` im Update-Banner.
- **`--no-cache`** nötig wenn Build-Args sich ändern (werden sonst aus Cache genommen).
- **Compose file:** `/docker/spliit/docker-compose.yml` (nicht das `compose.yaml` im Fork-Ordner).
- **Image-Name:** `spliit-custom` (nicht `spliit:latest`).
- **Port:** 3033 → 3000 (intern), erreichbar via `spliit.oscarr.de` (Traefik).

### Version prüfen

```bash
curl -s http://localhost:3033/version.json
# → {"version":301,"hash":"4a4b347","date":"..."}
```
