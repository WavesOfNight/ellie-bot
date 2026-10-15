#!/usr/bin/env bash
# Fonctions partagées par setup.sh, update.sh et backup.sh (à « sourcer », ne pas exécuter seul).

APP_DIR="${APP_DIR:-/opt/ellie-bot}"
APP_USER="${APP_USER:-ellie}"
SERVICES=(ellie-bot ellie-twitch ellie-web)

info() { printf '\033[1;35m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2
  exit 1
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Ce script doit être lancé en root (connecte-toi en SSH avec root, ou utilise sudo)."
}

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# Dossier contenant node et npm (≥ 22) : Node du système, sinon Node installé par l'extension Plesk.
detect_node_dir() {
  local candidate
  for candidate in "$(command -v node 2>/dev/null || true)" /opt/plesk/node/24/bin/node /opt/plesk/node/22/bin/node; do
    [[ -n "${candidate}" && -x "${candidate}" ]] || continue
    local dir
    dir="$(dirname "$(readlink -f "${candidate}")")"
    if (($(node_major "${candidate}") >= 22)) && [[ -x "${dir}/npm" ]]; then
      echo "${dir}"
      return 0
    fi
  done
  return 1
}

# Exécute une commande en tant qu'utilisateur système de l'application, avec le bon Node dans le PATH.
run_as_app() {
  local node_dir
  node_dir="$(detect_node_dir)" || die "Node.js 22 introuvable."
  runuser -u "${APP_USER}" -- env HOME="${APP_DIR}" PATH="${node_dir}:/usr/local/bin:/usr/bin:/bin" \
    NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false \
    bash -c "cd '${APP_DIR}' && $*"
}

# Installation propre des dépendances puis compilation des 5 workspaces (ordre imposé : database → ai → apps).
build_all() {
  info "Installation des dépendances npm (quelques minutes)…"
  if [[ -f "${APP_DIR}/package-lock.json" ]]; then
    run_as_app "npm ci --no-audit --no-fund"
  else
    run_as_app "npm install --no-audit --no-fund"
  fi
  info "Génération du client Prisma et mise à jour du schéma de la base…"
  run_as_app "npm run db:build && npm run db:push"
  info "Compilation (IA, bot Discord, bot Twitch, panel web)…"
  run_as_app "npm run ai:build && npm run bot:build && npm run twitch:build && npm run web:build"
  ok "Compilation terminée."
}
