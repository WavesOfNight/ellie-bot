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

## Étape 1 — Créer le sous-domaine dans Plesk

1. **Sites Web et domaines** → `reads-records.com` → **Ajouter un sous-domaine** → nom : `ellie`.
2. Dans les **Paramètres d'hébergement** de `ellie.reads-records.com` : coche **Redirection permanente 301 de HTTP vers HTTPS** (et tu peux décocher PHP, inutile ici).
3. **Certificats SSL/TLS** → **Let's Encrypt** → installe le certificat pour `ellie.reads-records.com`.

> Si la zone DNS de `reads-records.com` est gérée par Plesk, l'enregistrement `ellie` est créé tout seul. Sinon, ajoute chez ton registrar un enregistrement **A** `ellie` → `217.154.27.174`.

## Étape 2 — Préparer l'archive sur ton PC

Dans le dossier du projet, ouvre PowerShell et lance :

```powershell
powershell -ExecutionPolicy Bypass -File deploy\pack.ps1
```

Ça crée **`ellie-bot.tar.gz`** (environ 0,2 Mo : ni dépendances, ni base, ni secrets).

## Étape 3 — Envoyer l'archive sur le serveur

**Avec le gestionnaire de fichiers de Plesk (le plus simple) :**

1. **Sites Web et domaines** → `reads-records.com` → **Gestionnaire de fichiers**.
2. Reste **à la racine** (le dossier qui contient `httpdocs`, pas dedans) → **Téléverser** → choisis `ellie-bot.tar.gz`.

Le fichier arrive dans `/var/www/vhosts/reads-records.com/ellie-bot.tar.gz` (non accessible depuis le web).

*Alternative depuis PowerShell :* `scp ellie-bot.tar.gz root@217.154.27.174:/root/` (adapte alors le chemin à l'étape suivante).

## Étape 4 — Installer depuis le terminal SSH de Plesk

Ouvre **Extensions → SSH Terminal** (tu es en `root`). Colle ces commandes une par une.

Extraire l'archive (puis la supprimer) :

```bash
mkdir -p /opt/ellie-bot && tar -xzf /var/www/vhosts/reads-records.com/ellie-bot.tar.gz -C /opt/ellie-bot && rm /var/www/vhosts/reads-records.com/ellie-bot.tar.gz
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

## Étape 5 — Brancher le domaine sur le panel (nginx de Plesk)

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

Ouvre **https://ellie.reads-records.com** → page **« Bienvenue ! »** → crée ton **compte administrateur** (cette page disparaît ensuite).

## Étape 6 — Passer de l'ancien bot à Ellie

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

## Étape 7 — Le reste (facultatif)

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

1. Sur ton PC : `powershell -ExecutionPolicy Bypass -File deploy\pack.ps1`, puis téléverse `ellie-bot.tar.gz` comme à l'étape 3.
2. Dans le terminal SSH de Plesk :

```bash
tar -xzf /var/www/vhosts/reads-records.com/ellie-bot.tar.gz -C /opt/ellie-bot && rm /var/www/vhosts/reads-records.com/ellie-bot.tar.gz && bash /opt/ellie-bot/deploy/update.sh
```

`update.sh` sauvegarde la base, réinstalle, met à jour le schéma, recompile et **redémarre les trois services**. Tes `.env` et ta base ne sont jamais écrasés.

## Dépannage

| Symptôme | Solution |
|---|---|
| **502 Bad Gateway** | `systemctl status ellie-web` puis `journalctl -u ellie-web -n 50`. Vérifie que le port des directives nginx est celui du fichier `nginx-directives.generated.conf`. |
| La page par défaut de Plesk s'affiche | Les directives ne sont pas appliquées : recolle-les et décoche les deux options « fichiers statiques ». |
| Retour en boucle sur /login | `/opt/ellie-bot/apps/web/.env.local` doit contenir `NEXTAUTH_URL="https://ellie.reads-records.com"`, puis `systemctl restart ellie-web`. |
| Le bot Discord ne se connecte pas | `journalctl -u ellie-bot -n 50` : token invalide, intents non activés, ou l'ancien bot tourne encore avec le même token. |
| « Je n'ai pas le droit de toucher à ce rôle » | Le rôle d'Ellie doit être **au-dessus** des rôles à donner (Paramètres du serveur → Rôles). |
| L'installation semble bloquée | `tail -n 50 /root/ellie-setup.log` pour voir la dernière étape. Le script peut être relancé sans risque. |
