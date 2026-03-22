#!/bin/bash
# Spliit DB Backup — keeps last 14 daily dumps
BACKUP_DIR="/docker/spliit/backups"
FILENAME="spliit-$(date +%Y%m%d_%H%M%S).sql.gz"

docker exec spliit-db pg_dump -U postgres postgres | gzip > "${BACKUP_DIR}/${FILENAME}"

# Remove backups older than 14 days
find "${BACKUP_DIR}" -name "spliit-*.sql.gz" -mtime +14 -delete
