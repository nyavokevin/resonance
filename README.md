# 🎵 Resonance — Lecteur de musique multi-plateformes

Resonance accepte n'importe quel lien (Spotify, YouTube, YouTube Music,
Apple Music, SoundCloud, MP3 direct) et le joue dans une interface unifiée
sombre (style Discord), avec écoute synchronisée multi-utilisateurs (Jam),
le tout empaqueté en application desktop Windows (Electron).

## Démarrage

### Prérequis
- Node.js 20.9+ · npm
- Un projet [Supabase](https://supabase.com) (URL + clé anon)

### Installation
```bash
npm install
```

### 1. Base de données
Dans le **SQL Editor** de Supabase, exécute dans l'ordre (idempotents) :
1. `supabase/migrations/001_init.sql` — profils, titres aimés, historique, file persistée
2. `supabase/migrations/002_jam.sql` — sessions Jam, participants, RLS, Realtime

### 2. Variables d'environnement
Copie `.env.example` vers `.env.local` et renseigne :
```
NEXT_PUBLIC_SUPABASE_URL=https://TON-PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta-cle-anon
```
Redémarre le serveur après toute modification (`NEXT_PUBLIC_*` lues au démarrage).
Désactive la confirmation email si besoin : **Authentication → Providers → Email → Confirm email**.

### 3. Lancer
```bash
npm run dev            # web : http://localhost:3000
npm run electron:dev   # desktop (serveur Next embarqué)
npm run electron:build # installeur .exe → dossier release/
```

---

## Fonctionnalités

### Authentification (Supabase Auth)
- Inscription / connexion **email + mot de passe** (`/login`, `/signup`)
- `proxy.ts` : rafraîchit la session et protège toutes les routes (redirige vers `/login`)
- Profil auto-créé à l'inscription (trigger `handle_new_user`)
- Menu avatar dans le header (email + déconnexion)
- RLS activée partout : chaque utilisateur ne voit que ses données

### Barre de recherche universelle (header)
- **Colle un lien** : détection automatique de la plateforme (regex Spotify /
  YouTube / YouTube Music / Apple Music / SoundCloud / MP3 direct) avec badge
  coloré (`Auto-Detect` sinon)
- **Résolution** via `/api/resolve` (oEmbed + iTunes API + scraping page
  Spotify) : titre, artiste, pochette, durée, énumération complète des albums
  Apple Music et des playlists/albums Spotify (liste de vrais morceaux)
- **Playlists Spotify** : avec `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`
  (serveur uniquement, voir `.env.example`), résolution via Spotify Web API
  (pagination complète + ISRC) avec enrichissement iTunes exact et
  pré-résolution YouTube des titres illisibles ; sans credentials, fallback
  sur le scraping de la page embed
- **Fallback Spotify → YouTube** : aucun morceau issu de Spotify n'est lu
  via Spotify — chaque titre est matché vers YouTube (lecture intégrale
  systématique, jamais de preview démo) ; à l'échec, erreur explicite
  plutôt qu'un embed illisible
- **Texte libre** : recherche YouTube en direct (`/api/search`, debounce 400ms),
  dropdown de 12 résultats (miniature, titre, chaîne, durée)
  - **Clic sur un résultat → page détail** du morceau (`/song/[id]`) : pochette,
    titre, badge plateforme, durée, boutons ♥ / Ajouter à la file / Écouter,
    lien "Ouvrir la source"
  - **Bouton play rond à droite** → lecture immédiate sans quitter
  - Clavier : ↑↓ pour naviguer, Entrée pour le résultat surligné, Échap pour fermer
- Toasts de confirmation / erreur, retry auto en cas d'échec réseau

### Lecteur (player bar 90px, toujours visible)
- Pochette (pulse pendant la lecture), titre + artiste, badge plateforme, ♥ persisté
- Contrôles : **shuffle, précédent, play/pause (rond accent), suivant,
  repeat (off / all / one, 3 états)**
- **Seekbar** avec temps écoulé/total, prévisualisation au drag, désactivée sur
  plateformes à contrôles limités
- **Volume** : slider + mute ; badge source ; boutons paroles / file / plein écran
- Moteur unifié (`PlayerAdapter`) par plateforme :
  - **YouTube** : contrôle complet (IFrame API, attente `onReady` officielle)
  - **Spotify** : IFrame API (`createController`, seek en secondes)
  - **SoundCloud** : Widget API (play/pause/seek/volume, positions cachées)
  - **Apple Music** : embed (contrôles limités, UI de l'embed)
  - **MP3 direct** : `<audio>` natif
- Avance auto au morceau suivant, reprend en cas d'embed illisible
- **Raccourcis clavier** : Espace (play/pause), ←/→ (±5s), ↑/↓ (volume), M (mute), Q (file)
- **Anti-stutter** : cooldown 3s après chaque seek Jam, seuil de dérive 2000ms
- **Electron** : touches multimédia globales (play/pause, suivant, précédent)

### File d'attente (panneau 300px)
- "En cours de lecture" avec **égaliseur 3 barres animées**
- "À suivre" avec durée totale cumulée, **drag & drop** (dnd-kit), suppression
- Switch "Radio automatique" (placeholder), bouton Fermer
- Compteur de pistes dans l'en-tête

### Bibliothèque personnelle
- **Titres aimés** : ♥ partout (player bar, page morceau), page `/liked` en
  tableau, **badge compteur** dans la sidebar
- **Historique** : chaque lecture est enregistrée ; `router.refresh()` après
  lecture pour mise à jour instantanée des listes
- **Reprise d'état** : file, index, position, volume, repeat, shuffle restaurés
  au redémarrage (table `queue_state`, sauvegarde toutes les 5s)

### Pages
- **Accueil** (`/`) : salutation (Bonjour/Bonsoir + prénom), statut passerelle,
  bannière **Dernière écoute** (Écouter / Ajouter à la file), **Récemment
  écouté** (6 cartes compactes, lecture directe au clic), **Tendances**
  (top lectures par fréquence)
- **Titres aimés** (`/liked`), **Morceau** (`/song/[id]`), **Jam** (`/jam`)

### Jam — Écoute ensemble (Listen Together)
- **Créer** une session → code à 6 caractères ; **rejoindre** avec le code
  (bouton Radio dans le header, badge actif en session)
- **Host** : sa lecture locale (file, play/pause/seek/skip, position) est
  diffusée à tous ; les invités jouent sur leur propre appareil, synchronisé
- **Temps réel** : canal Realtime `jam:{id}` — broadcast WebSocket (~100ms)
  pour play/pause/position + `postgres_changes` en checkpoint (file, late joiners)
  + canal **presence** pour les connectés
- **Invités** : contrôles transport verrouillés sauf play/pause local ;
  play/pause local → **mode soft** (écoute libre sans perturber le live)
- **Règle anti-surprise** : un invité en pause ne démarre **jamais** tout seul —
  à la reprise du host, seul le bouton **"Go Live"** (pulsant, player bar) le
  recale sur le live ; **"Go Live"** visible si détaché, soft, ou en pause
  pendant que le host joue
- **File partagée** : tout le monde peut ajouter des titres (fonction SQL
  `jam_add_track`, propagation Realtime, fusion sans doublons côté host)
- **Participants en direct** : liste live (point vert) avec **"Écoute en ce
  moment : Titre — Artiste"** par personne (métadonnées de présence)
- **Persistance au refresh** : session restaurée depuis localStorage + validation
  serveur ; l'invité se resynchronise automatiquement
- Badge **"● JAM CODE • nom"** dans le player bar pendant la session

### Desktop (Electron)
- `electron/main.js` : serveur Next embarqué (`next dev`) ou standalone
  (`server.js`, `output: "standalone"`), fenêtre 1280×800, media keys globaux
- `npm run electron:build` : Next build → `prepare-electron.js` (copie
  static/public) → electron-builder (NSIS, `release/`, **~113 MB**)

---

## Architecture

```
app/
  layout.tsx            fonts (Inter, Plus Jakarta Sans, Material Symbols), tokens
  (auth)/login|signup   pages email + password
  (app)/                layout protégé + Shell (sidebar fixe, header fixe, player fixe)
    page.tsx            accueil (données serveur)
    liked/              titres aimés
    song/[id]/          détail morceau (résolution oEmbed serveur)
    jam/                création / join / session
  api/resolve|search    résolution d'URL, recherche YouTube
components/             Sidebar, TopBar, UrlInput, PlayerBar, PlayerControls,
                        QueuePanel, TrackList, LastPlayedBanner, SongActions,
                        Toaster, KeyboardShortcuts, JamController, Shell
lib/
  detect.ts             détection plateforme (regex)
  providers/resolve.ts  oEmbed / iTunes / scraping Spotify
  providers/search.ts   scraping ytInitialData
  player/               adapter.ts + youtube|spotify|soundcloud|apple|direct
  player/engine.ts      store Zustand (file, lecture, états Jam)
  supabase/             clients browser / server (+ proxy.ts à la racine)
  library.ts            likes / historique / file (client)
  library-server.ts     fetchLiked / fetchRecentTracks / fetchTrending (serveur)
  jam.ts                sessions, RPC, Realtime (état + broadcast + presence)
  jam-store.ts          session, participants (+morceau écouté), moi
  smartAddToQueue.ts    ajout file local vs Jam (host vs invité)
  toast-store.ts        toasts
electron/               main.js, preload.js (media keys)
supabase/migrations/    001_init.sql (base), 002_jam.sql (Jam)
scripts/                prepare-electron.js
proxy.ts                garde d'auth Next 16 (remplace middleware)
```

## Base de données (Supabase)

| Table | Rôle |
|---|---|
| `profiles` | id (= auth.uid), display_name, avatar_url (trigger à l'inscription, lecture ouverte aux authentifiés) |
| `liked_tracks` | likes par user (unique user+plateforme+id) |
| `history_entries` | historique (track jsonb) |
| `queue_state` | reprise d'état par user |
| `jam_sessions` | code, host, queue jsonb, current_track, index, position, is_playing |
| `jam_participants` | présence persistée (session, user) |

RLS `auth.uid()` partout ; fonctions `SECURITY DEFINER` anti-récursion
(`is_jam_participant`, `is_jam_host`) et d'accès contrôlé (`find_jam_session`,
`jam_add_track`) ; `jam_sessions` publiée sur `supabase_realtime`.

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur Next (web) |
| `npm run build` / `start` | build / serveur prod |
| `npm run lint` | ESLint |
| `npm run electron:dev` | app desktop en dev |
| `npm run electron:build` | build + installeur `.exe` |

## Limites connues (MVP)
- Apple Music : contrôles limités (pas de token MusicKit) — on utilise l'UI de l'embed.
  Les liens Apple Music servent à la correspondance exacte de métadonnées (ISRC),
  jamais comme plateforme de lecture des playlists (pas de position ni de fin
  de piste sans MusicKit JS + compte développeur Apple)
- Spotify : volume non contrôlable via l'IFrame API (limite officielle) ;
  les embeds peuvent afficher pubs/mur de login selon région — timeout 8s +
  fallback YouTube automatique dans ce cas
- Recherche textuelle : source YouTube uniquement (scraping, sans clé API)
- "Radio automatique", paroles, playlists, pages artiste/album, PWA : à venir
