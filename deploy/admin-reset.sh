#!/usr/bin/env bash
# =============================================================================
# Ellie [BOT] — réinitialise le mot de passe d'un compte administrateur du panel (en root).
# Usage : bash /opt/ellie-bot/deploy/admin-reset.sh <nom_utilisateur>
# Un nouveau mot de passe aléatoire est affiché une seule fois. Sans argument : liste les comptes.
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/common.sh
source "${SCRIPT_DIR}/common.sh"
require_root

username="${1:-}"
[[ -z "${username}" || "${username}" =~ ^[A-Za-z0-9._-]{3,32}$ ]] || die "Nom d'utilisateur invalide."
run_as_app "npm run --silent admin:reset-password -- ${username}"
