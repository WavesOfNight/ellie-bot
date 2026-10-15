#!/usr/bin/env bash
# =============================================================================
# Ellie [BOT] — sauvegarde à chaud de la base SQLite (cohérente même pendant que les bots tournent).
# Usage : bash /opt/ellie-bot/deploy/backup.sh      (garde les 14 dernières sauvegardes)
# Tâche planifiée conseillée (Plesk → Outils et paramètres → Tâches planifiées, en root) :
#   30 4 * * *   bash /opt/ellie-bot/deploy/backup.sh
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/common.sh
source "${SCRIPT_DIR}/common.sh"

DB="${APP_DIR}/data/ellie.db"
DEST="${APP_DIR}/backups"
KEEP="${KEEP:-14}"

[[ -f "${DB}" ]] || die "Base introuvable : ${DB}"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 n'est pas installé."
install -d -m 750 "${DEST}"

target="${DEST}/ellie-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "${DB}" ".backup '${target}'"
gzip -f "${target}"
chmod 600 "${target}.gz"
chown "${APP_USER}:${APP_USER}" "${target}.gz" 2>/dev/null || true

# Rotation : ne garde que les KEEP sauvegardes les plus récentes.
mapfile -t old < <(ls -1t "${DEST}"/ellie-*.db.gz 2>/dev/null | tail -n "+$((KEEP + 1))")
((${#old[@]})) && rm -f -- "${old[@]}"
ok "Sauvegarde créée : ${target}.gz"
