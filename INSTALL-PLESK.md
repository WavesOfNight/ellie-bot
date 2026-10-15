# Installer Ellie [BOT] sur ton Plesk — `ellie.reads-records.com`

Tout s'installe **sur ton VPS Plesk**, depuis le **terminal SSH de Plesk** (Extensions → SSH Terminal). Le domaine, le certificat HTTPS et nginx restent **gérés par Plesk**.

```
Internet ──HTTPS──▶ nginx de Plesk (ellie.reads-records.com) ──▶ 127.0.0.1:<port>  ellie-web    (panel)
                                                                                ellie-bot    (bot Discord)
                                                                                ellie-twitch (bot Twitch)
                                       une seule base SQLite : /opt/ellie-bot/data/ellie.db
```

Compte 20 à 30 minutes la première fois.

---

## Étape 1 — Créer le domaine dans Plesk

`reads-records.com` n'est pas hébergé dans ce Plesk : on y ajoute donc **`ellie.reads-records.com` comme un domaine à part entière** (et non comme un sous-domaine).

1. **Websites & Domains** → **Add Domain** → nom de domaine : `ellie.reads-records.com` → **Blank website** / hébergement web classique. Ne coche pas Let's Encrypt à cette étape.
2. **SSL/TLS Certificates** du domaine → **Let's Encrypt** → **Install**, en **décochant** les options « www » et « wildcard » (seul `ellie.reads-records.com` pointe vers le serveur).
3. **Hosting Settings** → coche **Permanent SEO-safe 301 redirect from HTTP to HTTPS** (tu peux décocher PHP, inutile ici).

> Le DNS reste chez ton registrar : l'enregistrement **A** `ellie` → `217.154.27.174` doit exister (si `http://ellie.reads-records.com` affiche la page par défaut de Plesk, c'est bon). L'avertissement « DNS needs attention » de Plesk peut être ignoré pour ce domaine.

## Étape 2 — Installer depuis le terminal SSH de Plesk

Le code est sur GitHub (dépôt public <https://github.com/WavesOfNight/ellie-bot>) : le serveur le récupère directement, rien à envoyer depuis ton PC.

Ouvre **Extensions → SSH Terminal** (tu es en `root`) et colle ces commandes **une par une**.

Vérifier que Git est présent (affiche une version) :

```bash
git --version
```

*(S'il est absent : `apt-get update && apt-get install -y git` sur Ubuntu/Debian, ou `dnf install -y git` sur AlmaLinux/Rocky.)*

Télécharger le projet :

```bash
git clone https://github.com/WavesOfNight/ellie-bot.git /opt/ellie-bot
```

Lancer l'installation en arrière-plan (elle continue même si l'onglet du terminal se ferme) :

```bash
DOMAIN=ellie.reads-records.com nohup bash /opt/ellie-bot/deploy/setup.sh > /root/ellie-setup.log 2>&1 &
```

Suivre l'avancement (5 à 10 minutes ; **Ctrl+C** arrête seulement l'affichage) :

```bash
tail -f /root/ellie-setup.log
```

Le script :

1. installe les paquets utiles (`git`, `sqlite3`, polices pour les images…) ;
2. utilise le Node.js 22+ déjà présent (y compris celui de l'extension **Node.js** de Plesk), sinon l'installe ;
3. crée l'utilisateur système **`ellie`** (sans connexion possible), propriétaire de `/opt/ellie-bot` ;
4. génère les fichiers `.env` avec une **clé de chiffrement** et un **secret de session** aléatoires (`chmod 600`) — relancer le script ne les change jamais ;
5. **choisit un port local libre** (3000, sinon 3100… : l'extension Monitoring de Plesk occupe souvent le 3000) ;
6. installe les dépendances, crée la base, compile, démarre les services **`ellie-bot`**, **`ellie-twitch`**, **`ellie-web`** ;
7. affiche à la fin **le bloc nginx à coller dans Plesk** (avec le bon port).

Quand tu vois **« Installation terminée ✅ »**, fais Ctrl+C. Tu peux réafficher le bloc nginx à tout moment :

```bash
cat /opt/ellie-bot/deploy/plesk/nginx-directives.generated.conf
```

## Étape 3 — Brancher le domaine sur le panel (nginx de Plesk)

**Sites Web et domaines** → `ellie.reads-records.com` → **Paramètres Apache & nginx** :

1. dans la partie nginx, **décoche** « **Gestion intelligente des fichiers statiques** » et « **Servir les fichiers statiques directement via nginx** » ;
2. laisse **Mode proxy** coché ;
3. colle dans **Directives nginx supplémentaires** le bloc affiché par le script (il ressemble à ceci, avec ton port) :

```nginx
location ~ ^/ {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 90s;
    client_max_body_size 5m;
}
```

4. **OK** (Plesk vérifie la configuration avant de l'appliquer).

### Si le domaine passe par Cloudflare (nuage orange) — c'est le cas de `reads-records.com`

En mode SSL « Flexible », Cloudflare contacte ton serveur en HTTP, Plesk le renvoie vers HTTPS, et le navigateur tourne en rond (**ERR_TOO_MANY_REDIRECTS**). Le serveur a un vrai certificat Let's Encrypt : il faut demander à Cloudflare de l'utiliser.

Cloudflare → `reads-records.com` → **Rules** (Règles) → **Configuration Rules** (Règles de configuration) → **Create rule** :

1. Nom : `Ellie - SSL strict` ;
2. **Custom filter expression** : *Hostname* · *equals* · `ellie.reads-records.com` ;
3. Paramètre **SSL** → **Full (strict)** ;
4. **Deploy**.

Cette règle ne touche que `ellie.reads-records.com` (tes autres sous-domaines gardent leur réglage). Si tous tes sites derrière `reads-records.com` ont un certificat sur leur serveur, tu peux aussi passer toute la zone en **Full (strict)** dans **SSL/TLS → Overview**.

Recharge ensuite la page dans une **fenêtre de navigation privée** (Chrome garde parfois l'ancienne redirection en cache).

Ouvre **https://ellie.reads-records.com** → page **« Bienvenue ! »** → crée ton **compte administrateur** (cette page disparaît ensuite).

## Étape 4 — Passer de l'ancien bot à Ellie

**Recommandé : garde la même application Discord que l'ancien bot.** Ainsi, ses messages déjà publiés (règlement, choix des rôles, aide) continuent de fonctionner et sont simplement **mis à jour** par Ellie — pas besoin de réinviter le bot.

1. **Arrête l'ancien bot** là où il tourne (deux programmes avec le même token se marchent dessus).
2. Sur <https://discord.com/developers/applications> → ton application → **Bot** : vérifie que **Server Members Intent** et **Message Content Intent** sont activés, puis **Reset Token** et copie le token.
3. **Général** → copie l'**Application ID**.
4. Panel Ellie → **Paramètres** (roue dentée) → **Bot Discord** → colle Application ID + token → **Enregistrer**. Ellie se connecte toute seule en quelques secondes.
5. Panel → ton serveur → **Panneaux de rôles** → **« Importer la configuration de l'ancien bot »**. Ça reprend :
   - les 5 menus **Pronoms, Notifications, Passions, Jeux, Couleur** avec tes rôles existants (même fonctionnement : un bouton → un menu à cocher, une seule couleur à la fois) ;
   - les **tickets** (catégorie 🎫 TICKETS, staff, ping des Gardien·nes et Anges gardien·nes, archives dans 📁・archives-tickets) ;
   - le **signalement anonyme** (vers 🚨・signalements) ;
   - le **règlement** et son bouton « J'ai lu et j'accepte » (rôle 🦊 Petit·e Renard·e).
6. Vérifie la page **Tickets** puis clique **« Mettre à jour le panneau »**, et sur la page **Bienvenue**, **« Enregistrer et mettre à jour sur Discord »** pour le règlement.

> Les anciennes commandes `/setup`, `/compliment`, `/calin`, `/boule-magique` disparaissent automatiquement au démarrage d'Ellie.
>
> **Si tu crées une nouvelle application Discord** à la place : invite-la avec le lien affiché dans Paramètres, place son rôle **tout en haut**, puis fais l'import ci-dessus — Ellie remplacera les anciens messages par les siens.

## Étape 5 — Le reste (facultatif)

- **Modules** : panel → ton serveur → Bienvenue, Modération, Niveaux, Commandes Perso, Giveaways, Starboard, Alertes… Tout est pris en compte en moins de 5 secondes.
- **Bot Twitch** : crée une application sur <https://dev.twitch.tv/console/apps> (catégorie *Chat Bot*, redirection `https://ellie.reads-records.com/api/twitch/callback`), puis panel → **Bot Twitch → Paramètres** → **Se connecter avec Twitch** avec le compte du bot → `/mod nom_du_bot` dans le chat de missTsune → **Modération** → **Bot Twitch activé**.
- **Ellie (IA)** : panel → **Paramètres** → clé API Anthropic, puis page **Ellie (IA)** du serveur → active-la et coche au moins un salon.

---

## Commandes utiles (terminal SSH de Plesk)

| Besoin | Commande |
|---|---|
| État des 3 services | `systemctl status ellie-bot ellie-twitch ellie-web` |
| Journaux en direct | `journalctl -u ellie-bot -f` (ou `ellie-twitch`, `ellie-web`) |
| Redémarrer | `systemctl restart ellie-bot ellie-twitch ellie-web` |
| Sauvegarder la base | `bash /opt/ellie-bot/deploy/backup.sh` |
| Mot de passe admin oublié | `bash /opt/ellie-bot/deploy/admin-reset.sh NOM_DU_COMPTE` |

**Sauvegarde automatique** : Plesk → **Outils et paramètres** → **Tâches planifiées** → tâche `root`, commande `bash /opt/ellie-bot/deploy/backup.sh`, tous les jours à 4 h 30 (les 14 dernières sont gardées dans `/opt/ellie-bot/backups/`).

## Mettre à jour plus tard

Quand une nouvelle version est poussée sur GitHub, une seule commande dans le terminal SSH de Plesk :

```bash
bash /opt/ellie-bot/deploy/update.sh
```

Elle récupère la dernière version (`git pull`), sauvegarde la base, réinstalle, met à jour le schéma, recompile et **redémarre les trois services**. Tes `.env` et ta base ne sont jamais touchés.

> Ne lance pas de commande `git` à la main en root dans `/opt/ellie-bot` : le dossier appartient à l'utilisateur `ellie`, `update.sh` s'en charge.

## Dépannage

| Symptôme | Solution |
|---|---|
| **502 Bad Gateway** | `systemctl status ellie-web` puis `journalctl -u ellie-web -n 50`. Vérifie que le port des directives nginx est celui du fichier `nginx-directives.generated.conf`. |
| **ERR_TOO_MANY_REDIRECTS** (domaine derrière Cloudflare) | Cloudflare est en mode SSL « Flexible » : passe `ellie.reads-records.com` en **Full (strict)** (voir l'étape 3), puis teste en navigation privée. |
| La page par défaut de Plesk s'affiche | Les directives ne sont pas appliquées : recolle-les et décoche les deux options « fichiers statiques ». |
| Retour en boucle sur /login | `/opt/ellie-bot/apps/web/.env.local` doit contenir `NEXTAUTH_URL="https://ellie.reads-records.com"`, puis `systemctl restart ellie-web`. |
| Le bot Discord ne se connecte pas | `journalctl -u ellie-bot -n 50` : token invalide, intents non activés, ou l'ancien bot tourne encore avec le même token. |
| « Je n'ai pas le droit de toucher à ce rôle » | Le rôle d'Ellie doit être **au-dessus** des rôles à donner (Paramètres du serveur → Rôles). |
| L'installation semble bloquée | `tail -n 50 /root/ellie-setup.log` pour voir la dernière étape. Le script peut être relancé sans risque. |
