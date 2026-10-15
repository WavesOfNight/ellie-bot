#!/usr/bin/env bash
# =============================================================================
# Ellie [BOT] — mise à jour (en root) : bash /opt/ellie-bot/deploy/update.sh
#
# - Dépôt Git : récupère la dernière version (git pull).
# - Archive : extrais d'abord la nouvelle archive par-dessus /opt/ellie-bot (les .env et data/ sont conservés).
# Puis : dépendances, client Prisma + schéma, compilation des 5 workspaces, redémarrage des 3 services.
# Les trois services sont TOUJOURS redémarrés : un process non redémarré garderait l'ancien code partagé.
# =============================================================================
set -Eeuo pipefail
trap 'die "Échec à la ligne ${LINENO} : ${BASH_COMMAND}"' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/common.sh
source "${SCRIPT_DIR}/common.sh"
require_root

if [[ -d "${APP_DIR}/.git" ]]; then
  info "Récupération de la dernière version (git pull)…"
  # package-lock.json peut avoir été modifié localement par npm : on le restaure avant de tirer.
  run_as_app "git checkout -- package-lock.json 2>/dev/null || true; git pull --ff-only"
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
info "Sauvegarde de la base avant mise à jour…"
bash "${SCRIPT_DIR}/backup.sh" || warn "Sauvegarde impossible (base absente ?) : on continue."

build_all

info "Redémarrage des services…"
systemctl daemon-reload
systemctl restart "${SERVICES[@]}"
sleep 3
for service in "${SERVICES[@]}"; do
  if systemctl is-active --quiet "${service}"; then ok "${service} actif"; else warn "${service} ne démarre pas : journalctl -u ${service} -n 50"; fi
done
ok "Mise à jour terminée."
