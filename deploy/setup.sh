#!/usr/bin/env bash
# =============================================================================
# Ellie [BOT] — installation initiale sur un serveur Plesk (Debian/Ubuntu ou AlmaLinux/Rocky)
#
# Usage (en root) :
#   DOMAIN=ellie.mondomaine.fr bash /opt/ellie-bot/deploy/setup.sh
# Options :
#   REPO_URL=…                                      dépôt à cloner si /opt/ellie-bot est vide (défaut : dépôt GitHub public)
#   WEB_PORT=3100                                   port local du panel (défaut : premier port libre à partir de 3000)
#   APP_DIR=/opt/ellie-bot  APP_USER=ellie
#
# Le script est ré-exécutable sans risque : il ne régénère jamais une clé de chiffrement existante.
# Il ne touche pas à la configuration de Plesk (nginx, certificats) : voir INSTALL-PLESK.md.
# =============================================================================
set -Eeuo pipefail
trap 'die "Échec à la ligne ${LINENO} : ${BASH_COMMAND}"' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/common.sh
source "${SCRIPT_DIR}/common.sh"

DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-https://github.com/WavesOfNight/ellie-bot.git}"

require_root
[[ -n "${DOMAIN}" ]] || die "Indique le domaine du panel : DOMAIN=ellie.mondomaine.fr bash $0"
[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]] || die "Domaine invalide : ${DOMAIN}"

port_in_use() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }

# Port local du panel : celui demandé, sinon celui d'une installation précédente, sinon le premier
# port libre (sur Plesk, l'extension Monitoring/Grafana occupe souvent déjà le port 3000).
existing_port="$(grep -hs '^PORT=' "${APP_DIR}/apps/web/.env.local" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
WEB_PORT="${WEB_PORT:-${existing_port}}"
if [[ -z "${WEB_PORT}" ]]; then
  for candidate in 3000 3100 3210 3333 3456; do
    if ! port_in_use "${candidate}"; then
      WEB_PORT="${candidate}"
      break
    fi
  done
fi
[[ "${WEB_PORT}" =~ ^[0-9]+$ ]] || die "Aucun port libre trouvé : relance avec WEB_PORT=<port libre>."

# -----------------------------------------------------------------------------
info "1/7 Paquets système"
# -----------------------------------------------------------------------------
if command -v apt-get >/dev/null 2>&1; then
  PKG=apt
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates git openssl sqlite3 fontconfig fonts-dejavu-core >/dev/null
elif command -v dnf >/dev/null 2>&1; then
  PKG=dnf
  dnf install -y -q curl ca-certificates git openssl sqlite fontconfig dejavu-sans-fonts >/dev/null
else
  die "Gestionnaire de paquets non pris en charge (apt ou dnf requis)."
fi
ok "Paquets installés (sans ffmpeg : inutile pour ce bot)."

# -----------------------------------------------------------------------------
info "2/7 Node.js 22"
# -----------------------------------------------------------------------------
if NODE_DIR="$(detect_node_dir)"; then
  ok "Node.js $("${NODE_DIR}/node" -v) trouvé dans ${NODE_DIR}"
else
  info "Installation de Node.js 22 (NodeSource)…"
  if [[ "${PKG}" == apt ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  else
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null
    dnf install -y -q nodejs >/dev/null
  fi
  NODE_DIR="$(detect_node_dir)" || die "Node.js 22 n'a pas pu être installé."
  ok "Node.js $("${NODE_DIR}/node" -v) installé."
fi

# -----------------------------------------------------------------------------
info "3/7 Utilisateur système « ${APP_USER} » et code de l'application"
# -----------------------------------------------------------------------------
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_DIR}" --no-create-home --shell /usr/sbin/nologin "${APP_USER}"
  ok "Utilisateur ${APP_USER} créé."
fi
if [[ ! -f "${APP_DIR}/package.json" ]]; then
  info "Clonage de ${REPO_URL}…"
  git clone "${REPO_URL}" "${APP_DIR}"
fi
install -d -m 750 "${APP_DIR}/data" "${APP_DIR}/backups"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
ok "Code présent dans ${APP_DIR}."

# -----------------------------------------------------------------------------
info "4/7 Fichiers .env (secrets générés une seule fois, chmod 600)"
# -----------------------------------------------------------------------------
DB_URL="file:${APP_DIR}/data/ellie.db"
existing_key="$(grep -hs '^TOKEN_ENCRYPTION_KEY=' "${APP_DIR}/apps/bot/.env" "${APP_DIR}/apps/web/.env.local" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
TOKEN_KEY="${existing_key:-$(openssl rand -hex 32)}"
existing_secret="$(grep -hs '^NEXTAUTH_SECRET=' "${APP_DIR}/apps/web/.env.local" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
AUTH_SECRET="${existing_secret:-$(openssl rand -base64 32)}"

write_env() {
  local file="$1"
  shift
  printf '%s\n' "# Généré par deploy/setup.sh — ne pas versionner" "$@" >"${file}"
  chown "${APP_USER}:${APP_USER}" "${file}"
  chmod 600 "${file}"
}
write_env "${APP_DIR}/packages/database/.env" "DATABASE_URL=\"${DB_URL}\""
write_env "${APP_DIR}/apps/bot/.env" "DATABASE_URL=\"${DB_URL}\"" "TOKEN_ENCRYPTION_KEY=\"${TOKEN_KEY}\"" "DISCORD_DEV_GUILD_ID=\"\""
write_env "${APP_DIR}/apps/twitch-bot/.env" "DATABASE_URL=\"${DB_URL}\"" "TOKEN_ENCRYPTION_KEY=\"${TOKEN_KEY}\""
write_env "${APP_DIR}/apps/web/.env.local" "DATABASE_URL=\"${DB_URL}\"" "TOKEN_ENCRYPTION_KEY=\"${TOKEN_KEY}\"" \
  "NEXTAUTH_URL=\"https://${DOMAIN}\"" "NEXTAUTH_SECRET=\"${AUTH_SECRET}\"" "AUTH_TRUST_HOST=\"true\"" "PORT=\"${WEB_PORT}\""
ok "Fichiers .env écrits (clé de chiffrement ${existing_key:+conservée}${existing_key:-générée})."

# -----------------------------------------------------------------------------
info "5/7 Dépendances et compilation"
# -----------------------------------------------------------------------------
build_all

# -----------------------------------------------------------------------------
info "6/7 Services systemd"
# -----------------------------------------------------------------------------
if ! systemctl is-active --quiet ellie-web && port_in_use "${WEB_PORT}"; then
  die "Le port ${WEB_PORT} est déjà utilisé sur ce serveur : relance avec WEB_PORT=3100 (par exemple)."
fi
for service in "${SERVICES[@]}"; do
  sed -e "s#__APP_DIR__#${APP_DIR}#g" -e "s#__APP_USER__#${APP_USER}#g" -e "s#__NODE_DIR__#${NODE_DIR}#g" \
    "${APP_DIR}/deploy/systemd/${service}.service" >"/etc/systemd/system/${service}.service"
done
systemctl daemon-reload
systemctl enable --now "${SERVICES[@]}" >/dev/null 2>&1
systemctl restart "${SERVICES[@]}"
sleep 3
for service in "${SERVICES[@]}"; do
  if systemctl is-active --quiet "${service}"; then ok "${service} actif"; else warn "${service} ne démarre pas : journalctl -u ${service} -n 50"; fi
done

# -----------------------------------------------------------------------------
info "7/7 Directives nginx à coller dans Plesk"
# -----------------------------------------------------------------------------
sed "s#__WEB_PORT__#${WEB_PORT}#g" "${APP_DIR}/deploy/plesk/nginx-directives.conf" >"${APP_DIR}/deploy/plesk/nginx-directives.generated.conf"
cat <<EOF

=============================================================================
 Installation terminée ✅

 Dernières étapes dans Plesk (détaillées dans INSTALL-PLESK.md) :
  1. Sites Web et domaines → ${DOMAIN} → Certificats SSL/TLS → Let's Encrypt
  2. Paramètres Apache & nginx → décocher « Gestion intelligente des fichiers
     statiques » et « Servir les fichiers statiques directement via nginx »,
     puis coller dans « Directives nginx supplémentaires » :

$(cat "${APP_DIR}/deploy/plesk/nginx-directives.generated.conf")

  3. Ouvre https://${DOMAIN} : crée le compte administrateur, puis colle
     le token du bot dans Paramètres.

 Commandes utiles :
   systemctl status ellie-bot ellie-twitch ellie-web
   journalctl -u ellie-bot -f
   bash ${APP_DIR}/deploy/update.sh        (mise à jour)
=============================================================================
EOF
