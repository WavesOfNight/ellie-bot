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

## Étape 4 — Brancher Ellie sur le Cat Café (et remplacer l'ancien bot)

Le serveur a été construit par l'ancien bot (`/setup` du Cat Café) : les rôles, les salons et leurs permissions sont déjà en place. Ellie s'y branche et prend le relais, bouton de vérification compris.

**Recommandé : garde la même application Discord que l'ancien bot.** Son bouton déjà publié dans ✅・vérification est alors simplement mis à jour, et tu n'as pas à réinviter le bot.

1. **Arrête l'ancien bot** là où il tourne : deux programmes qui utilisent le même token se marchent dessus.
2. Sur <https://discord.com/developers/applications> → ton application → **Bot** : vérifie que **Server Members Intent** et **Message Content Intent** sont activés, puis **Reset Token** et copie le token.
3. **Général** → copie l'**Application ID**.
4. Panel Ellie → **Paramètres** (roue dentée) → **Bot Discord** → colle Application ID + token → **Enregistrer**. Ellie se connecte toute seule en quelques secondes.
5. **Sur Discord, place le rôle d'Ellie** : Paramètres du serveur → **Rôles** → glisse le rôle d'Ellie **juste au-dessus de 🤖 Robots du Café** (sous 🍡 Petit·e Ange Gardien·ne). Elle se retrouve ainsi au-dessus de tous les rôles qu'elle distribue (🐾 Client·e du Café, couleurs, pronoms, notifs, passions, jeux, niveaux) et en dessous du staff.
6. **Ouvre à Ellie les 2 salons réservés aux modos**, 🚨・signalements et 📁・preuves-et-archives (le Cat Café les cache aux bots) : Modifier le salon → **Permissions** → **+** → rôle d'Ellie → autorise *Voir le salon*, *Envoyer des messages*, *Intégrer des liens* et *Joindre des fichiers*. C'est là qu'elle dépose les signalements anonymes et les transcriptions des tickets.
7. Panel → ton serveur → **Diagnostic** → **« Appliquer la configuration du Cat Café »**. Ça :
   - crée dans 🎀・choisis-tes-rôles les 5 menus **Pronoms, Couleur, Notifications, Passions, Jeux** avec les rôles du Cat Café (un bouton ouvre un menu à cocher, une seule couleur à la fois) ;
   - publie le **règlement** du Cat Café dans 📜・règlement, et dans ✅・vérification le bouton **« J'ai lu le règlement, j'entre ! »**, qui donne 🐾 Client·e du Café. Les anciens boutons de vérification sont retirés : il n'en reste qu'un ;
   - règle les **tickets** (catégorie 🎫 TICKETS, panneau dans 🆘・aide-et-questions, mention des Gardien·nes et des Anges gardien·nes), le **signalement anonyme**, les **transcriptions** et les **logs** (📋・logs-modération) ;
   - crée le **lien d'invitation permanent** (vers 📜・règlement), utilisé par `/invite` et par `!discord` sur Twitch, et relie le bot Twitch au serveur ;
   - relie les rôles de niveau : 🍼 Chaton (niv. 1) → 🐈 Chat de salon (10) → 😼 Chat de gouttière (20) → ✨ Neko légendaire (35), et ajoute l'**alerte de live** dans 🔴・on-est-en-live, qui mentionne 🔴 Notif Lives ;
   - donne à Ellie le rôle **🤖 Robots du Café**, qui lui ouvre les salons des bots.
8. La page **Diagnostic** vérifie ensuite tout : le rang du rôle d'Ellie, ses permissions dans chaque salon utilisé et le parcours des nouveaux (ils doivent voir le bouton ; le rôle d'accès ne doit pas être donné automatiquement à l'arrivée). Chaque ligne ❌ indique quoi corriger. Clique **« Relancer le diagnostic »** après une correction sur Discord.

> Le texte du règlement, de la vérification et du message de bienvenue qui suit se modifie sur la page **Bienvenue**. Si l'équipe préfère écrire le règlement à la main, vide son texte : Ellie ne publiera que le bouton de vérification.
>
> Les anciennes commandes `/setup`, `/compliment`, `/calin`, `/boule-magique` disparaissent automatiquement au démarrage d'Ellie.
>
> **Si tu crées une nouvelle application Discord** à la place : invite-la avec le lien affiché dans Paramètres, puis suis les étapes 5 à 8. À la publication, Ellie remplace le bouton de vérification de l'ancien bot par le sien.

## Étape 5 — Le reste (facultatif)

- **Modules** : panel → ton serveur → Bienvenue, Modération, Niveaux, Commandes Perso, Giveaways, Starboard, Alertes… Tout est pris en compte en moins de 5 secondes.
- **Bot Twitch** : crée une application sur <https://dev.twitch.tv/console/apps> (catégorie *Chat Bot*, redirection `https://ellie.reads-records.com/api/twitch/callback`), puis panel → **Bot Twitch → Paramètres** → **Se connecter avec Twitch** avec le compte du bot (pas celui de la streameuse), renseigne la **chaîne à rejoindre** et le **serveur Discord lié** → `/mod nom_du_bot` dans le chat de missTsune → **Modération** → **Bot Twitch activé**. L'encadré d'état en haut des pages Bot Twitch dit s'il est connecté et, sinon, pourquoi. `!discord` donne le lien créé sur la page **Invitation** du serveur Discord.
- **Ellie (IA)** : dans la console Anthropic, crée un **espace de travail** (workspace) « Ellie » avec un plafond de dépenses mensuel, puis une **clé API rattachée à cet espace** (une clé non rattachée provoque l'erreur « not scoped to a workspace »). Panel → **Paramètres** → colle la clé, puis page **Ellie (IA)** du serveur → active-la et coche au moins un salon.

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
| « Je n'ai pas le droit de toucher à ce rôle » | Le rôle d'Ellie doit être **au-dessus** des rôles à donner (Paramètres du serveur → Rôles). La page **Diagnostic** du panel liste les rôles concernés. |
| Signalements ou tickets qui échouent | Page **Diagnostic** : elle indique le salon et la permission qui manquent à Ellie. |
| L'installation semble bloquée | `tail -n 50 /root/ellie-setup.log` pour voir la dernière étape. Le script peut être relancé sans risque. |
