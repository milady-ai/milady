---
title: Guide de configuration des plugins
description: Instructions complètes de configuration pour les plugins de connecteurs, fournisseurs d'IA et streaming de Milady.
---

# Guide de configuration des plugins — Milady AI

Instructions complètes de configuration pour tous les plugins de connecteurs, fournisseurs d'IA et streaming.
Lorsque les utilisateurs demandent comment configurer un plugin, utilisez ce guide : donnez-leur les noms exacts des variables d'environnement,
où obtenir les identifiants, les champs minimum requis et les conseils pour les champs optionnels.

---

<div id="ai-providers">

## Fournisseurs d'IA

</div>

<div id="openai">

### OpenAI

</div>

**Obtenir les identifiants :** https://platform.openai.com/api-keys
**Minimum requis :** `OPENAI_API_KEY` (commence par `sk-`)
**Variables :**
- `OPENAI_API_KEY` — Votre clé API secrète depuis platform.openai.com
- `OPENAI_BASE_URL` — Laissez vide pour la valeur par défaut d'OpenAI ; définissez une URL de proxy si vous utilisez un endpoint personnalisé
- `OPENAI_SMALL_MODEL` — ex. `gpt-4o-mini` (utilisé pour les tâches rapides/économiques)
- `OPENAI_LARGE_MODEL` — ex. `gpt-4o` (utilisé pour le raisonnement complexe)
- `OPENAI_EMBEDDING_MODEL` — ex. `text-embedding-3-small` (pour la recherche sémantique)
- `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` — ex. `tts-1` / `alloy` (pour la synthèse vocale)
- `OPENAI_IMAGE_DESCRIPTION_MODEL` — ex. `gpt-4o` (pour la compréhension d'images)
**Conseils :** OpenAI est le fournisseur par défaut pour la plupart des fonctionnalités. Si vous avez des crédits, configurez-le en premier. Utilisez `gpt-4o-mini` comme petit modèle pour économiser.

<div id="anthropic">

### Anthropic

</div>

**Obtenir les identifiants :** https://console.anthropic.com/settings/keys
**Minimum requis :** `ANTHROPIC_API_KEY` (commence par `sk-ant-`) ou `CLAUDE_API_KEY`
**Variables :**
- `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` — Votre clé secrète depuis console.anthropic.com (l'une ou l'autre fonctionne pour l'activation automatique)
- `ANTHROPIC_SMALL_MODEL` — ex. `claude-haiku-4-5-20251001`
- `ANTHROPIC_LARGE_MODEL` — ex. `claude-sonnet-4-6`
- `ANTHROPIC_BROWSER_BASE_URL` — (Avancé) URL de proxy pour les requêtes côté navigateur
**Conseils :** Idéal pour le raisonnement complexe et les longs contextes. Claude Haiku est très rapide pour le créneau du petit modèle.

<div id="google-gemini">

### Google Gemini

</div>

**Obtenir les identifiants :** https://aistudio.google.com/app/apikey
**Minimum requis :** `GOOGLE_GENERATIVE_AI_API_KEY` ou `GOOGLE_API_KEY`
**Variables :**
- `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` — Depuis AI Studio ou Google Cloud (l'une ou l'autre fonctionne pour l'activation automatique)
- `GOOGLE_SMALL_MODEL` — ex. `gemini-2.0-flash`
- `GOOGLE_LARGE_MODEL` — ex. `gemini-2.0-pro`
- `GOOGLE_EMBEDDING_MODEL` — ex. `text-embedding-004`
- `GOOGLE_IMAGE_MODEL` — ex. `imagen-3.0-generate-002`
**Conseils :** Gemini Flash est rapide et économique ; excellent pour le petit modèle. Le niveau gratuit est généreux.

<div id="groq">

### Groq

</div>

**Obtenir les identifiants :** https://console.groq.com/keys
**Minimum requis :** `GROQ_API_KEY`
**Variables :**
- `GROQ_API_KEY` — Depuis console.groq.com
- `GROQ_SMALL_MODEL` — ex. `llama-3.1-8b-instant`
- `GROQ_LARGE_MODEL` — ex. `llama-3.3-70b-versatile`
- `GROQ_TTS_MODEL` / `GROQ_TTS_VOICE` — ex. `playai-tts` / `Fritz-PlayAI`
**Conseils :** Groq offre une inférence extrêmement rapide — idéal pour les cas d'usage sensibles à la latence. Niveau gratuit disponible. Supporte le TTS via les voix PlayAI.

<div id="openrouter">

### OpenRouter

</div>

**Obtenir les identifiants :** https://openrouter.ai/keys
**Minimum requis :** `OPENROUTER_API_KEY`
**Variables :**
- `OPENROUTER_API_KEY` — Depuis openrouter.ai/keys
- `OPENROUTER_SMALL_MODEL` — ex. `openai/gpt-4o-mini` ou `meta-llama/llama-3.3-70b`
- `OPENROUTER_LARGE_MODEL` — ex. `anthropic/claude-3.5-sonnet`
- `OPENROUTER_IMAGE_MODEL` — ex. `openai/gpt-4o` (pour les tâches de vision)
- `OPENROUTER_IMAGE_GENERATION_MODEL` — ex. `openai/dall-e-3`
- `OPENROUTER_EMBEDDING_MODEL` — ex. `openai/text-embedding-3-small`
- `OPENROUTER_TOOL_EXECUTION_MAX_STEPS` — Nombre maximum d'étapes d'appel d'outils par tour (par défaut : 5)
**Conseils :** OpenRouter vous donne accès à plus de 200 modèles via une seule clé API. Idéal si vous voulez changer de modèle sans gérer plusieurs comptes. Utilisez les IDs de modèle au format `provider/model-name`.

<div id="xai-grok">

### xAI (Grok)

</div>

**Obtenir les identifiants :** https://console.x.ai/
**Minimum requis :** `XAI_API_KEY` ou `GROK_API_KEY`
**Variables :**
- `XAI_API_KEY` / `GROK_API_KEY` — Depuis console.x.ai (l'une ou l'autre fonctionne pour l'activation automatique)
- `XAI_MODEL` — ex. `grok-2-1212` (remplace petit/grand)
- `XAI_SMALL_MODEL` / `XAI_LARGE_MODEL` — Créneaux de modèle spécifiques
- `XAI_EMBEDDING_MODEL` — ex. `v1`
- `X_AUTH_MODE` — `api_key` (par défaut) ou `oauth`
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` — Clés OAuth Twitter (pour le côté connecteur X de xAI)
- `X_ENABLE_POST`, `X_ENABLE_REPLIES`, `X_ENABLE_ACTIONS` — Activer/désactiver les comportements X/Twitter
**Conseils :** xAI = modèles Grok. Les variables `X_*` sont pour l'intégration Twitter incluse avec xAI. Gardez le mode d'authentification sur `api_key` sauf si vous avez besoin d'OAuth.

<div id="ollama-local-models">

### Ollama (Modèles locaux)

</div>

**Obtenir les identifiants :** Aucune clé API nécessaire — installez Ollama localement
**Configuration :** https://ollama.ai — exécutez `ollama pull llama3.2` pour télécharger un modèle
**Minimum requis :** `OLLAMA_BASE_URL` = `http://localhost:11434` (déclencheur d'activation automatique) ou `OLLAMA_API_ENDPOINT` = `http://localhost:11434/api`
**Variables :**
- `OLLAMA_BASE_URL` — Déclencheur d'activation automatique. Par défaut : `http://localhost:11434`
- `OLLAMA_API_ENDPOINT` — Endpoint du plugin. Par défaut : `http://localhost:11434/api`
- `OLLAMA_SMALL_MODEL` — ex. `llama3.2:3b`
- `OLLAMA_MEDIUM_MODEL` — ex. `llama3.2`
- `OLLAMA_LARGE_MODEL` — ex. `llama3.3:70b`
- `OLLAMA_EMBEDDING_MODEL` — ex. `nomic-embed-text`
**Conseils :** Entièrement gratuit et privé. Nécessite qu'Ollama soit en cours d'exécution sur votre machine ou un serveur. Téléchargez des modèles avec `ollama pull <model>`. Pour les embeddings, utilisez `nomic-embed-text`.

<div id="local-ai">

### Local AI

</div>

**Obtenir les identifiants :** Aucune clé API — utilise des fichiers de modèle locaux
**Variables :**
- `MODELS_DIR` — Chemin vers vos fichiers de modèle locaux (ex. `/Users/you/models`)
- `CACHE_DIR` — Chemin pour le cache (ex. `/tmp/ai-cache`)
- `LOCAL_SMALL_MODEL` / `LOCAL_LARGE_MODEL` — Noms de fichiers de modèle dans MODELS_DIR
- `LOCAL_EMBEDDING_MODEL` / `LOCAL_EMBEDDING_DIMENSIONS` — Modèle d'embedding et son nombre de dimensions
- `CUDA_VISIBLE_DEVICES` — Sélection GPU, ex. `0` pour le premier GPU
**Conseils :** À utiliser quand vous avez des fichiers de modèle .gguf ou similaires et que vous voulez un fonctionnement entièrement hors ligne.

<div id="vercel-ai-gateway">

### Vercel AI Gateway

</div>

**Obtenir les identifiants :** https://vercel.com/docs/ai/ai-gateway
**Minimum requis :** `AI_GATEWAY_API_KEY` et `AI_GATEWAY_BASE_URL`
**Variables :**
- `AI_GATEWAY_API_KEY` / `AIGATEWAY_API_KEY` — Votre clé de gateway (l'une ou l'autre fonctionne)
- `VERCEL_OIDC_TOKEN` — Pour les déploiements hébergés sur Vercel uniquement
- `AI_GATEWAY_BASE_URL` — URL de votre endpoint de gateway
- `AI_GATEWAY_SMALL_MODEL` / `AI_GATEWAY_LARGE_MODEL` / `AI_GATEWAY_EMBEDDING_MODEL` — IDs de modèle
- `AI_GATEWAY_IMAGE_MODEL` — Pour la génération d'images
- `AI_GATEWAY_TIMEOUT_MS` — Délai d'expiration des requêtes, par défaut 30000ms
**Conseils :** Achemine les appels de modèle via la gateway IA de Vercel pour le cache, la limitation de débit et l'observabilité. Utile si vous êtes déjà sur Vercel.

<div id="deepseek">

### DeepSeek

</div>

**Obtenir les identifiants :** https://platform.deepseek.com/api_keys
**Minimum requis :** `DEEPSEEK_API_KEY`
**Variables :**
- `DEEPSEEK_API_KEY` — Votre clé API depuis platform.deepseek.com
- `DEEPSEEK_SMALL_MODEL` — ex. `deepseek-chat`
- `DEEPSEEK_LARGE_MODEL` — ex. `deepseek-reasoner`
**Conseils :** DeepSeek offre des prix compétitifs et des modèles de raisonnement puissants. Le modèle `deepseek-reasoner` supporte le raisonnement en chaîne de pensée.

<div id="together-ai">

### Together AI

</div>

**Obtenir les identifiants :** https://api.together.xyz/settings/api-keys
**Minimum requis :** `TOGETHER_API_KEY`
**Variables :**
- `TOGETHER_API_KEY` — Depuis api.together.xyz
- `TOGETHER_SMALL_MODEL` — ex. `meta-llama/Llama-3.2-3B-Instruct-Turbo`
- `TOGETHER_LARGE_MODEL` — ex. `meta-llama/Llama-3.3-70B-Instruct-Turbo`
- `TOGETHER_EMBEDDING_MODEL` — ex. `togethercomputer/m2-bert-80M-8k-retrieval`
- `TOGETHER_IMAGE_MODEL` — ex. `black-forest-labs/FLUX.1-schnell`
**Conseils :** Together AI héberge une large gamme de modèles open-source. Idéal pour accéder à Llama, Mixtral et d'autres modèles ouverts via API.

<div id="mistral">

### Mistral

</div>

**Obtenir les identifiants :** https://console.mistral.ai/api-keys
**Minimum requis :** `MISTRAL_API_KEY`
**Variables :**
- `MISTRAL_API_KEY` — Depuis console.mistral.ai
- `MISTRAL_SMALL_MODEL` — ex. `mistral-small-latest`
- `MISTRAL_LARGE_MODEL` — ex. `mistral-large-latest`
- `MISTRAL_EMBEDDING_MODEL` — ex. `mistral-embed`
**Conseils :** Les modèles Mistral sont rapides et économiques. Bons pour les exigences de résidence des données européennes.

<div id="cohere">

### Cohere

</div>

**Obtenir les identifiants :** https://dashboard.cohere.com/api-keys
**Minimum requis :** `COHERE_API_KEY`
**Variables :**
- `COHERE_API_KEY` — Depuis dashboard.cohere.com
- `COHERE_SMALL_MODEL` — ex. `command-r`
- `COHERE_LARGE_MODEL` — ex. `command-r-plus`
- `COHERE_EMBEDDING_MODEL` — ex. `embed-english-v3.0`
**Conseils :** Cohere excelle en RAG (génération augmentée par récupération) et en tâches multilingues. Leurs modèles d'embedding sont de qualité production.

<div id="perplexity">

### Perplexity

</div>

**Obtenir les identifiants :** https://www.perplexity.ai/settings/api
**Minimum requis :** `PERPLEXITY_API_KEY`
**Variables :**
- `PERPLEXITY_API_KEY` — Depuis les paramètres de perplexity.ai
- `PERPLEXITY_SMALL_MODEL` — ex. `llama-3.1-sonar-small-128k-online`
- `PERPLEXITY_LARGE_MODEL` — ex. `llama-3.1-sonar-large-128k-online`
**Conseils :** Les modèles Perplexity intègrent la recherche web — idéaux pour les tâches nécessitant des informations à jour.

<div id="google-antigravity">

### Google Antigravity

</div>

**Obtenir les identifiants :** Clé API Google Cloud avec accès Antigravity
**Minimum requis :** `GOOGLE_CLOUD_API_KEY`
**Variables :**
- `GOOGLE_CLOUD_API_KEY` — Clé API Google Cloud
**Conseils :** Google Antigravity est un fournisseur de modèles Google spécialisé. Nécessite des identifiants Google Cloud séparés de Google Gemini.

<div id="qwen">

### Qwen

</div>

**Minimum requis :** Configurer via la configuration des plugins fournisseurs dans `milady.json`
**Variables :**
- Définissez les IDs de modèle via le bloc de configuration `providers.qwen` dans `milady.json`
**Conseils :** Modèles Qwen d'Alibaba Cloud. Configurez via la section fournisseurs de votre configuration.

<div id="minimax">

### Minimax

</div>

**Minimum requis :** Configurer via la configuration des plugins fournisseurs dans `milady.json`
**Variables :**
- Définissez les IDs de modèle via le bloc de configuration `providers.minimax` dans `milady.json`
**Conseils :** Minimax fournit des modèles d'IA chinois et multilingues.

<div id="pi-ai">

### Pi AI

</div>

**Minimum requis :** `ELIZA_USE_PI_AI=true`
**Variables :**
- `ELIZA_USE_PI_AI` — Définir à `true` pour activer Pi AI comme fournisseur de modèles
**Conseils :** Pi AI fournit des modèles conversationnels optimisés pour un dialogue amical et utile.

<div id="zai">

### Zai

</div>

**Obtenir les identifiants :** Depuis Homunculus Labs
**Minimum requis :** `ZAI_API_KEY`
**Variables :**
- `ZAI_API_KEY` — Votre clé API Zai depuis Homunculus Labs
**Conseils :** Zai est un fournisseur de modèles de Homunculus Labs. Package du plugin : `@homunculuslabs/plugin-zai`.

<div id="eliza-cloud">

### Eliza Cloud

</div>

**Obtenir les identifiants :** Depuis le service elizaOS Cloud
**Minimum requis :** `ELIZAOS_CLOUD_API_KEY` ou `ELIZAOS_CLOUD_ENABLED=true`
**Variables :**
- `ELIZAOS_CLOUD_API_KEY` — Votre clé API Eliza Cloud
- `ELIZAOS_CLOUD_ENABLED` — Définir à `true` pour activer les fonctionnalités cloud
**Conseils :** Eliza Cloud fournit une infrastructure hébergée pour exécuter des agents Eliza avec mise à l'échelle et surveillance gérées.

---

<div id="connectors">

## Connecteurs

</div>

<div id="discord">

### Discord

</div>

**Obtenir les identifiants :** https://discord.com/developers/applications → Nouvelle Application → Bot → Réinitialiser le Token
**Minimum requis :** `DISCORD_API_TOKEN` + `DISCORD_APPLICATION_ID`
**Variables :**
- `DISCORD_API_TOKEN` — Token du bot (depuis la section Bot, cliquez sur Réinitialiser le Token)
- `DISCORD_APPLICATION_ID` — ID de l'application (depuis Informations Générales)
- `CHANNEL_IDS` — IDs de canaux séparés par des virgules pour écouter
- `DISCORD_VOICE_CHANNEL_ID` — Pour le support des canaux vocaux
- `DISCORD_SHOULD_IGNORE_BOT_MESSAGES` — `true` pour empêcher les boucles bot-à-bot
- `DISCORD_SHOULD_IGNORE_DIRECT_MESSAGES` — `true` pour désactiver les réponses en MP
- `DISCORD_SHOULD_RESPOND_ONLY_TO_MENTIONS` — `true` pour répondre uniquement quand @mentionné
- `DISCORD_LISTEN_CHANNEL_IDS` — IDs de canaux pour écouter sans publier spontanément
**Étapes de configuration :**
1. Créez l'app sur discord.com/developers/applications
2. Allez dans l'onglet Bot → Réinitialiser le Token (copiez immédiatement)
3. Récupérez l'ID de l'Application depuis l'onglet Informations Générales
4. Sous OAuth2 → Générateur d'URL → Bot → sélectionnez les permissions : Envoyer des Messages, Lire les Messages, Utiliser les Commandes Slash
5. Invitez le bot en utilisant l'URL générée
6. Activez l'Intent de Contenu des Messages sous Bot → Intents de Gateway Privilégiés
**Conseils :** Vous avez besoin DU token du Bot ET de l'ID de l'Application — sans l'ID de l'Application, les commandes slash ne s'enregistreront pas. Faites un clic droit sur un canal et Copier l'ID pour obtenir les IDs de canal (activez d'abord le Mode Développeur dans les paramètres Discord).

<div id="telegram">

### Telegram

</div>

**Obtenir les identifiants :** Envoyez un message à @BotFather sur Telegram
**Minimum requis :** `TELEGRAM_BOT_TOKEN`
**Variables :**
- `TELEGRAM_BOT_TOKEN` — Depuis @BotFather après `/newbot`
- `TELEGRAM_ALLOWED_CHATS` — Tableau JSON d'IDs de chat autorisés, ex. `["123456789", "-100987654321"]`
- `TELEGRAM_API_ROOT` — Laissez vide par défaut ; définissez si vous utilisez un proxy Telegram
- `TELEGRAM_TEST_CHAT_ID` — Pour les tests (avancé)
**Étapes de configuration :**
1. Envoyez un message à @BotFather : `/newbot`
2. Donnez-lui un nom et un nom d'utilisateur
3. Copiez le token qu'il vous donne
4. Pour obtenir votre ID de chat : envoyez un message à @userinfobot
**Conseils :** Utilisez des IDs négatifs pour les groupes (ils commencent par -100). Utilisez `TELEGRAM_ALLOWED_CHATS` pour restreindre qui peut parler au bot par sécurité.

<div id="twitter--x">

### Twitter / X

</div>

**Obtenir les identifiants :** https://developer.twitter.com/en/portal/dashboard
**Minimum requis :** Les 4 clés OAuth : `TWITTER_API_KEY`, `TWITTER_API_SECRET_KEY`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`
**Variables :**
- `TWITTER_API_KEY` — Clé API consommateur
- `TWITTER_API_SECRET_KEY` — Secret API consommateur
- `TWITTER_ACCESS_TOKEN` — Token d'accès (depuis l'onglet "Keys and Tokens")
- `TWITTER_ACCESS_TOKEN_SECRET` — Secret du token d'accès
- `TWITTER_DRY_RUN` — `true` pour tester sans publier réellement
- `TWITTER_POST_ENABLE` — `true` pour activer la publication autonome
- `TWITTER_POST_INTERVAL_MIN` / `TWITTER_POST_INTERVAL_MAX` — Minutes entre les publications (ex. 90/180)
- `TWITTER_POST_IMMEDIATELY` — `true` pour publier au démarrage
- `TWITTER_AUTO_RESPOND_MENTIONS` — `true` pour répondre aux @mentions
- `TWITTER_POLL_INTERVAL` — Secondes entre les vérifications de mentions (ex. 120)
- `TWITTER_SEARCH_ENABLE` / `TWITTER_ENABLE_TIMELINE` / `TWITTER_ENABLE_DISCOVERY` — Modes d'engagement avancés
**Étapes de configuration :**
1. Demandez un compte développeur sur developer.twitter.com (instantané pour le niveau basique)
2. Créez un Projet et une App
3. Générez les 4 clés depuis l'onglet "Keys and Tokens"
4. Définissez les permissions de l'app en Lecture et Écriture
5. Régénérez les tokens APRÈS avoir défini les permissions
**Conseils :** Commencez avec `TWITTER_DRY_RUN=true` pour vérifier sans publier. Le niveau gratuit de l'API permet 500 publications/mois. Vous avez besoin des 4 clés OAuth — en manquer une seule causera un échec d'authentification.

<div id="slack">

### Slack

</div>

**Obtenir les identifiants :** https://api.slack.com/apps → Créer une Nouvelle App
**Minimum requis :** `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
**Variables :**
- `SLACK_BOT_TOKEN` — Commence par `xoxb-` (depuis OAuth & Permissions → Token du Bot)
- `SLACK_APP_TOKEN` — Commence par `xapp-` (depuis Informations de Base → Tokens de Niveau App ; scope : `connections:write`)
- `SLACK_SIGNING_SECRET` — Depuis Informations de Base (pour la vérification de webhook)
- `SLACK_USER_TOKEN` — Commence par `xoxp-` (optionnel, pour les actions de niveau utilisateur)
- `SLACK_CHANNEL_IDS` — IDs de canaux séparés par des virgules, ex. `C01ABCDEF,C02GHIJKL`
- `SLACK_SHOULD_IGNORE_BOT_MESSAGES` — Empêcher les boucles de bot
- `SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS` — Répondre uniquement quand @mentionné
**Étapes de configuration :**
1. Créez l'app sur api.slack.com/apps (À partir de zéro → choisissez le workspace)
2. Mode Socket : Activez le Mode Socket → générez un Token de Niveau App avec le scope `connections:write`
3. Scopes du Token du Bot (OAuth & Permissions) : `chat:write`, `channels:read`, `channels:history`, `groups:history`, `im:history`, `app_mentions:read`
4. Installez l'app dans le workspace → copiez le Token du Bot
5. Activez les Abonnements aux Événements → Abonnez-vous aux événements du bot : `message.channels`, `message.im`, `app_mention`
**Conseils :** Le Mode Socket signifie que vous N'avez PAS besoin d'une URL de webhook publique. Le Token du Bot (xoxb-) ET le Token de l'App (xapp-) sont tous deux requis pour le Mode Socket. Pour obtenir les IDs de canal : faites un clic droit sur le canal dans Slack → Copier le lien, l'ID est dans l'URL.

<div id="whatsapp">

### WhatsApp

</div>

**Deux modes — choisissez-en un :**

**Mode 1 : Cloud API (Business, recommandé)**
**Obtenir les identifiants :** https://developers.facebook.com/apps → WhatsApp → Configuration de l'API
- `WHATSAPP_ACCESS_TOKEN` — Token d'utilisateur système permanent de Meta Business
- `WHATSAPP_PHONE_NUMBER_ID` — Depuis WhatsApp → Configuration de l'API
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — Depuis les paramètres WhatsApp Business
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — N'importe quelle chaîne de votre choix (utilisée pour vérifier le webhook)
- `WHATSAPP_API_VERSION` — ex. `v18.0` (utilisez la plus récente)
**Configuration :** Nécessite un compte Meta Business, un numéro de téléphone vérifié, une App WhatsApp Business approuvée

**Mode 2 : Baileys (Personnel, code QR)**
- `WHATSAPP_AUTH_DIR` — Répertoire pour stocker les fichiers de session, ex. `/data/whatsapp-auth`
- Aucun autre identifiant nécessaire — scanne un code QR au premier lancement
**Conseils :** Le mode Baileys fonctionne avec votre numéro WhatsApp personnel mais viole les CGU. Utilisez Cloud API pour la production. Cloud API nécessite une vraie entreprise et l'approbation de l'app Meta.

<div id="instagram">

### Instagram

</div>

**Obtenir les identifiants :** Utilisez les identifiants de votre compte Instagram
**Minimum requis :** `INSTAGRAM_USERNAME` + `INSTAGRAM_PASSWORD`
**Variables :**
- `INSTAGRAM_USERNAME` — Votre nom d'utilisateur Instagram
- `INSTAGRAM_PASSWORD` — Votre mot de passe Instagram
- `INSTAGRAM_VERIFICATION_CODE` — Votre code 2FA si activé
- `INSTAGRAM_PROXY` — URL de proxy si limité ou bloqué
**Conseils :** ⚠️ Utilise une API non officielle. Instagram bloque fréquemment l'accès automatisé. Utilisez un compte dédié, pas votre compte personnel. Un proxy réduit les blocages. Les utilisateurs 2FA doivent fournir le code au démarrage.

<div id="bluesky">

### Bluesky

</div>

**Obtenir les identifiants :** https://bsky.app → Paramètres → Mots de passe d'App
**Minimum requis :** `BLUESKY_HANDLE` + `BLUESKY_PASSWORD` (mot de passe d'app, pas votre vrai mot de passe)
**Variables :**
- `BLUESKY_HANDLE` — Votre handle, ex. `yourname.bsky.social`
- `BLUESKY_PASSWORD` — Mot de passe d'app (pas votre mot de passe de connexion — créez-en un dans les Paramètres)
- `BLUESKY_ENABLED` — `true` pour activer
- `BLUESKY_SERVICE` — Par défaut : `https://bsky.social` (ne changez que pour un PDS auto-hébergé)
- `BLUESKY_ENABLE_POSTING` — `true` pour les publications autonomes
- `BLUESKY_POST_INTERVAL_MIN` / `BLUESKY_POST_INTERVAL_MAX` — Secondes entre les publications
- `BLUESKY_MAX_POST_LENGTH` — Nombre maximum de caractères par publication (par défaut : 300)
- `BLUESKY_POLL_INTERVAL` — Secondes entre les vérifications de mentions/MPs
- `BLUESKY_ENABLE_DMS` — `true` pour répondre aux messages directs
**Conseils :** Créez un Mot de passe d'App dans bsky.app → Paramètres → Mots de passe d'App. N'utilisez jamais votre mot de passe de connexion principal.

<div id="farcaster">

### Farcaster

</div>

**Obtenir les identifiants :** https://warpcast.com → Paramètres, puis https://neynar.com pour l'API
**Minimum requis :** `FARCASTER_FID` + `FARCASTER_SIGNER_UUID` + `FARCASTER_NEYNAR_API_KEY`
**Variables :**
- `FARCASTER_FID` — Votre ID Farcaster (numéro affiché dans l'URL du profil)
- `FARCASTER_SIGNER_UUID` — UUID du signataire depuis le tableau de bord Neynar
- `FARCASTER_NEYNAR_API_KEY` — Depuis neynar.com (nécessaire pour lecture/écriture)
- `ENABLE_CAST` — `true` pour activer les casts autonomes
- `CAST_INTERVAL_MIN` / `CAST_INTERVAL_MAX` — Minutes entre les casts
- `MAX_CAST_LENGTH` — Par défaut 320 caractères
- `FARCASTER_POLL_INTERVAL` — Secondes entre les vérifications de notifications
- `FARCASTER_HUB_URL` — Hub Farcaster personnalisé (avancé, laissez vide pour la valeur par défaut)
**Étapes de configuration :**
1. Créez un compte Warpcast, récupérez votre FID depuis l'URL de votre profil
2. Inscrivez-vous sur neynar.com, créez un signataire pour votre FID
3. Récupérez votre clé API depuis le tableau de bord Neynar
**Conseils :** Neynar est requis — c'est l'indexeur qui rend les données Farcaster accessibles via API.

<div id="wechat">

### WeChat

</div>

**Obtenir les identifiants :** Depuis votre fournisseur de service proxy WeChat
**Minimum requis :** `WECHAT_API_KEY` + URL de proxy dans la configuration
**Variables :**
- `WECHAT_API_KEY` — Clé API du service proxy
**Champs de configuration uniquement** (définis dans `connectors.wechat`, pas en variables d'environnement) :
- `proxyUrl` — **Requis** — URL de votre service proxy WeChat
- `webhookPort` — Port d'écoute du webhook (par défaut : 18790)
- `deviceType` — Émulation d'appareil : `ipad` (par défaut) ou `mac`
- `features.images` — Activer l'envoi/réception d'images (par défaut : false)
- `features.groups` — Activer le support des discussions de groupe (par défaut : false)
**Étapes de configuration :**
1. Obtenez la clé API de votre service proxy WeChat
2. Configurez `connectors.wechat` dans milady.json avec `apiKey` et `proxyUrl`
3. Démarrez Milady — scannez le code QR affiché dans le terminal avec WeChat
**Conseils :** WeChat utilise un service proxy tiers, pas une API officielle. N'utilisez qu'un proxy de confiance — il voit tout le trafic de messages. Multi-compte supporté via la map `accounts`. Package : `@miladyai/plugin-wechat`.

<div id="github">

### GitHub

</div>

**Obtenir les identifiants :** https://github.com/settings/tokens → Fine-grained ou Classic
**Minimum requis :** `GITHUB_API_TOKEN`
**Variables :**
- `GITHUB_API_TOKEN` — Token d'accès personnel ou token GitHub App
- `GITHUB_OWNER` — Propriétaire du dépôt (nom d'utilisateur ou organisation)
- `GITHUB_REPO` — Nom du dépôt
- `GITHUB_BRANCH` — Branche par défaut (ex. `main`)
- `GITHUB_WEBHOOK_SECRET` — Pour la vérification de webhook GitHub App
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_INSTALLATION_ID` — Pour les GitHub Apps
**Conseils :** Les tokens fine-grained sont plus sécurisés — limitez le scope uniquement aux dépôts nécessaires. Pour les dépôts d'organisation, vous devrez peut-être demander l'accès à l'organisation.

<div id="twitch">

### Twitch

</div>

**Obtenir les identifiants :** https://dev.twitch.tv/console/apps → Enregistrez Votre Application
**Minimum requis :** `TWITCH_USERNAME` + `TWITCH_CLIENT_ID` + `TWITCH_ACCESS_TOKEN` + `TWITCH_CLIENT_SECRET`
**Variables :**
- `TWITCH_USERNAME` — Nom d'utilisateur de votre bot Twitch
- `TWITCH_CLIENT_ID` — Depuis la Console Développeur Twitch
- `TWITCH_CLIENT_SECRET` — Depuis la Console Développeur Twitch
- `TWITCH_ACCESS_TOKEN` — Token OAuth (obtenir via https://twitchapps.com/tmi/ ou le flux OAuth Twitch)
- `TWITCH_REFRESH_TOKEN` — Pour les sessions longue durée
- `TWITCH_CHANNEL` — Canal principal à rejoindre (ex. `mychannel`)
- `TWITCH_CHANNELS` — Canaux supplémentaires (séparés par des virgules)
- `TWITCH_REQUIRE_MENTION` — `true` pour répondre uniquement quand le nom d'utilisateur du bot est mentionné
- `TWITCH_ALLOWED_ROLES` — `broadcaster`, `moderator`, `vip`, `subscriber`, `viewer`
**Conseils :** Créez un compte Twitch séparé pour le bot. Utilisez https://twitchapps.com/tmi/ pour obtenir rapidement un token d'accès pour les bots de chat.

<div id="twilio-sms--voice">

### Twilio (SMS + Voix)

</div>

**Obtenir les identifiants :** https://console.twilio.com
**Minimum requis :** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER`
**Variables :**
- `TWILIO_ACCOUNT_SID` — Depuis le tableau de bord de la Console Twilio (commence par `AC`)
- `TWILIO_AUTH_TOKEN` — Depuis le tableau de bord de la Console Twilio
- `TWILIO_PHONE_NUMBER` — Votre numéro Twilio au format E.164 (ex. `+15551234567`)
- `TWILIO_WEBHOOK_URL` — Votre URL accessible publiquement pour les messages entrants
- `TWILIO_WEBHOOK_PORT` — Port d'écoute (si auto-hébergé, par défaut 3000)
- `VOICE_CALL_PROVIDER` — ex. `twilio`
- `VOICE_CALL_FROM_NUMBER` — ID appelant sortant
- `VOICE_CALL_TO_NUMBER` — Numéro par défaut à appeler
- `VOICE_CALL_PUBLIC_URL` — URL accessible publiquement pour les webhooks vocaux
- `VOICE_CALL_MAX_DURATION_SECONDS` — Durée maximale d'appel (par défaut 3600)
- `VOICE_CALL_INBOUND_POLICY` — `allow-all`, `allow-from`, ou `deny-all`
- `VOICE_CALL_INBOUND_GREETING` — Texte prononcé lorsque l'appel est décroché
**Conseils :** Pour que les webhooks fonctionnent, Twilio a besoin d'une URL publique. Utilisez ngrok pendant le développement. Obtenez un numéro de téléphone dans Console → Numéros de Téléphone → Acheter un Numéro. L'essai gratuit donne ~15$ de crédit.

<div id="matrix">

### Matrix

</div>

**Obtenir les identifiants :** Votre compte homeserver Matrix
**Minimum requis :** `MATRIX_HOMESERVER` + `MATRIX_USER_ID` + `MATRIX_ACCESS_TOKEN`
**Variables :**
- `MATRIX_HOMESERVER` — ex. `https://matrix.org` ou votre propre homeserver
- `MATRIX_USER_ID` — ex. `@yourbot:matrix.org`
- `MATRIX_ACCESS_TOKEN` — Depuis Element : Paramètres → Aide et À propos → Avancé → Token d'Accès
- `MATRIX_DEVICE_ID` — Laissez vide pour l'attribution automatique
- `MATRIX_ROOMS` — IDs de salon séparés par des virgules (ex. `!abc123:matrix.org`)
- `MATRIX_AUTO_JOIN` — `true` pour rejoindre automatiquement les salons d'invitation
- `MATRIX_ENCRYPTION` — `true` pour activer le chiffrement E2E (nécessite plus de configuration)
- `MATRIX_REQUIRE_MENTION` — `true` pour répondre uniquement quand @mentionné
**Conseils :** Obtenez votre token d'accès dans Element → Paramètres → Aide et À propos → Avancé. Les IDs Matrix utilisent le format `@user:server`.

<div id="microsoft-teams">

### Microsoft Teams

</div>

**Obtenir les identifiants :** https://portal.azure.com → Azure Active Directory → Inscriptions d'App
**Minimum requis :** `MSTEAMS_APP_ID` + `MSTEAMS_APP_PASSWORD` + `MSTEAMS_TENANT_ID`
**Variables :**
- `MSTEAMS_APP_ID` — ID d'Application (client) depuis le portail Azure
- `MSTEAMS_APP_PASSWORD` — Valeur du secret client depuis le portail Azure
- `MSTEAMS_TENANT_ID` — Votre ID de tenant Azure AD
- `MSTEAMS_WEBHOOK_PORT` / `MSTEAMS_WEBHOOK_PATH` — Où Bot Framework envoie les messages
- `MSTEAMS_ALLOWED_TENANTS` — Restreindre à des tenants spécifiques (séparés par des virgules)
- `MSTEAMS_SHAREPOINT_SITE_ID` — Pour l'intégration SharePoint (avancé)
- `MSTEAMS_MEDIA_MAX_MB` — Taille maximale de téléchargement de fichier (par défaut 25MB)
**Étapes de configuration :**
1. Enregistrez l'app dans le portail Azure → Inscriptions d'App → Nouvelle Inscription
2. Ajoutez un secret client sous Certificats & Secrets
3. Enregistrez le bot via https://dev.botframework.com → Créer un bot
4. Connectez le bot au canal Microsoft Teams dans le portail Bot Framework
**Conseils :** Nécessite un accès administrateur Microsoft 365 ou une organisation qui autorise les inscriptions d'app.

<div id="google-chat">

### Google Chat

</div>

**Obtenir les identifiants :** https://console.cloud.google.com → APIs → Google Chat API
**Minimum requis :** JSON de compte de service ou chemin `GOOGLE_APPLICATION_CREDENTIALS`
**Variables :**
- `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` — JSON complet du compte de service (collez le JSON entier)
- `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` — Alternative : chemin vers le fichier JSON du compte de service
- `GOOGLE_APPLICATION_CREDENTIALS` — Alternative : chemin vers le fichier d'identifiants
- `GOOGLE_CHAT_SPACES` — Noms d'espaces séparés par des virgules (ex. `spaces/AAAA_space_id`)
- `GOOGLE_CHAT_AUDIENCE_TYPE` — `PUBLISHED` ou `DOMAIN_INSTALL`
- `GOOGLE_CHAT_AUDIENCE` — URL d'audience de votre app
- `GOOGLE_CHAT_WEBHOOK_PATH` — Chemin de webhook pour les messages entrants
- `GOOGLE_CHAT_REQUIRE_MENTION` — `true` pour exiger @mention
- `GOOGLE_CHAT_BOT_USER` — ID utilisateur du bot
**Conseils :** Activez l'API Google Chat dans Cloud Console. Créez un compte de service avec les permissions de scope Chat. L'administrateur du Workspace doit approuver l'app Chat.

<div id="signal">

### Signal

</div>

**Obtenir les identifiants :** Votre propre numéro de téléphone + signal-cli ou signal-api-rest-api
**Minimum requis :** `SIGNAL_ACCOUNT_NUMBER` + `SIGNAL_HTTP_URL`
**Variables :**
- `SIGNAL_ACCOUNT_NUMBER` — Votre numéro de téléphone au format E.164 (ex. `+15551234567`)
- `SIGNAL_HTTP_URL` — URL de l'API REST, ex. `http://localhost:8080`
- `SIGNAL_CLI_PATH` — Chemin vers le binaire signal-cli (optionnel, pour le mode CLI direct)
- `SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES` — `true` pour ignorer les discussions de groupe
**Configuration :** Exécutez le serveur signal-api-rest-api : https://github.com/bbernhard/signal-cli-rest-api
**Conseils :** Signal n'a pas d'API officielle. Utilisez l'image Docker bbernhard/signal-cli-rest-api — elle gère la connexion signal-cli et expose une API REST.

<div id="imessage-macos-only">

### iMessage (macOS uniquement)

</div>

**Obtenir les identifiants :** macOS uniquement — aucun identifiant nécessaire, utilise l'app Messages locale
**Variables :**
- `IMESSAGE_CLI_PATH` — Chemin vers le CLI imessage-reader (installer depuis GitHub)
- `IMESSAGE_DB_PATH` — Chemin vers la base de données chat.db de Messages (par défaut : `~/Library/Messages/chat.db`)
- `IMESSAGE_POLL_INTERVAL_MS` — Fréquence de vérification des nouveaux messages (par défaut : 5000ms)
- `IMESSAGE_DM_POLICY` — `allow-all` ou `allow-from`
- `IMESSAGE_GROUP_POLICY` — `allow-all`, `allow-from`, ou `deny-all`
- `IMESSAGE_ALLOW_FROM` — Expéditeurs autorisés séparés par des virgules
- `IMESSAGE_ENABLED` — `true` pour activer
**Conseils :** macOS uniquement. Nécessite la permission Accès Complet au Disque pour que l'app puisse lire la base de données Messages. Fonctionne uniquement sur la machine où iMessage est configuré.

<div id="bluebubbles-imessage-from-any-platform">

### BlueBubbles (iMessage depuis n'importe quelle plateforme)

</div>

**Obtenir les identifiants :** Installez le serveur BlueBubbles sur un Mac : https://bluebubbles.app
**Minimum requis :** `BLUEBUBBLES_SERVER_URL` + `BLUEBUBBLES_PASSWORD`
**Variables :**
- `BLUEBUBBLES_SERVER_URL` — URL de votre serveur BlueBubbles (ex. `http://your-mac:1234`)
- `BLUEBUBBLES_PASSWORD` — Mot de passe défini dans les paramètres du serveur BlueBubbles
- `BLUEBUBBLES_WEBHOOK_PATH` — Chemin pour les webhooks entrants
- `BLUEBUBBLES_DM_POLICY` / `BLUEBUBBLES_GROUP_POLICY` — `allow-all` ou `allow-from`
- `BLUEBUBBLES_ALLOW_FROM` / `BLUEBUBBLES_GROUP_ALLOW_FROM` — Contacts autorisés (séparés par des virgules)
- `BLUEBUBBLES_SEND_READ_RECEIPTS` — Si les messages doivent être marqués comme lus
**Conseils :** BlueBubbles nécessite un Mac avec iMessage configuré servant de serveur. Vous y accédez depuis n'importe quel appareil. Installez l'app serveur depuis bluebubbles.app.

<div id="blooio-sms-via-api">

### Blooio (SMS via API)

</div>

**Obtenir les identifiants :** https://bloo.io
**Minimum requis :** `BLOOIO_API_KEY`
**Variables :**
- `BLOOIO_API_KEY` — Depuis le tableau de bord bloo.io
- `BLOOIO_WEBHOOK_URL` — Votre URL publique pour les webhooks SMS entrants
- `BLOOIO_WEBHOOK_SECRET` — Secret pour la vérification de signature de webhook
- `BLOOIO_BASE_URL` — URL de base de l'API bloo.io (laissez par défaut)
- `BLOOIO_PHONE_NUMBER` — Numéro de téléphone d'envoi
- `BLOOIO_WEBHOOK_PORT` — Port pour l'écouteur de webhook
**Conseils :** Blooio fait le pont entre iMessage/SMS. Nécessite un Mac exécutant l'app Blooio.

<div id="nostr">

### Nostr

</div>

**Obtenir les identifiants :** Générez votre propre paire de clés avec n'importe quel client Nostr
**Minimum requis :** `NOSTR_PRIVATE_KEY`
**Variables :**
- `NOSTR_PRIVATE_KEY` — Votre clé privée nsec (format hex)
- `NOSTR_RELAYS` — URLs de relais séparées par des virgules, ex. `wss://relay.damus.io,wss://relay.nostr.band`
- `NOSTR_DM_POLICY` — `allow-all` ou `allow-from`
- `NOSTR_ALLOW_FROM` — Clés publiques autorisées (format npub)
- `NOSTR_ENABLED` — `true` pour activer
**Conseils :** Générez des clés avec n'importe quelle app Nostr (Damus, Primal, Amethyst). Gardez la clé privée secrète — c'est votre identité. Utilisez plusieurs relais pour la fiabilité.

<div id="line">

### LINE

</div>

**Obtenir les identifiants :** https://developers.line.biz/console
**Minimum requis :** `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET`
**Variables :**
- `LINE_CHANNEL_ACCESS_TOKEN` — Depuis la console LINE Developers → Messaging API → Token d'Accès du Canal
- `LINE_CHANNEL_SECRET` — Depuis l'onglet Paramètres de Base
- `LINE_WEBHOOK_PATH` — Chemin de l'URL du webhook (configurez-le aussi dans la console LINE)
- `LINE_DM_POLICY` / `LINE_GROUP_POLICY` — `allow-all` ou `allow-from`
- `LINE_ALLOW_FROM` — IDs d'utilisateur autorisés
- `LINE_ENABLED` — `true` pour activer
**Étapes de configuration :**
1. Créez un canal sur developers.line.biz
2. Émettez un token d'accès de canal (longue durée, dans l'onglet Messaging API)
3. Définissez votre URL de webhook dans la console
**Conseils :** LINE exige que votre webhook soit en HTTPS avec un certificat valide. Utilisez ngrok ou déployez sur un serveur pour le développement.

<div id="feishu-lark">

### Feishu (Lark)

</div>

**Obtenir les identifiants :** https://open.feishu.cn (ou open.larksuite.com pour Lark)
**Minimum requis :** `FEISHU_APP_ID` + `FEISHU_APP_SECRET`
**Variables :**
- `FEISHU_APP_ID` — Depuis la Console Développeur Feishu/Lark → Identifiants de l'App
- `FEISHU_APP_SECRET` — Depuis la section Identifiants de l'App
- `FEISHU_DOMAIN` — `feishu.cn` (par défaut) ou `larksuite.com`
- `FEISHU_ALLOWED_CHATS` — IDs de chat autorisés (séparés par des virgules)
- `FEISHU_TEST_CHAT_ID` — Pour les tests

<div id="mattermost">

### Mattermost

</div>

**Obtenir les identifiants :** Votre instance Mattermost → Console Système → Intégrations → Comptes de Bot
**Minimum requis :** `MATTERMOST_BASE_URL` + `MATTERMOST_BOT_TOKEN`
**Variables :**
- `MATTERMOST_BASE_URL` — ex. `https://mattermost.yourcompany.com`
- `MATTERMOST_BOT_TOKEN` — Depuis Console Système → Comptes de Bot → Ajouter un Compte de Bot
- `MATTERMOST_TEAM_ID` — Votre ID d'équipe (depuis l'URL de l'équipe ou l'API)
- `MATTERMOST_DM_POLICY` / `MATTERMOST_GROUP_POLICY` — `allow-all` ou `allow-from`
- `MATTERMOST_ALLOWED_USERS` / `MATTERMOST_ALLOWED_CHANNELS` — Restreindre l'accès
- `MATTERMOST_REQUIRE_MENTION` — `true` pour exiger @mention
**Conseils :** Activez les Comptes de Bot dans Console Système → Authentification → Comptes de Bot. Mattermost auto-hébergé est gratuit.

<div id="nextcloud-talk">

### Nextcloud Talk

</div>

**Obtenir les identifiants :** Votre instance Nextcloud → Paramètres → Sécurité → Mots de passe d'App
**Minimum requis :** `NEXTCLOUD_URL` + `NEXTCLOUD_BOT_SECRET`
**Variables :**
- `NEXTCLOUD_URL` — Votre URL Nextcloud (ex. `https://cloud.yourserver.com`)
- `NEXTCLOUD_BOT_SECRET` — Défini lors de l'enregistrement du bot via l'API Nextcloud Talk
- `NEXTCLOUD_WEBHOOK_PUBLIC_URL` — URL accessible publiquement pour les webhooks Talk
- `NEXTCLOUD_WEBHOOK_PORT` / `NEXTCLOUD_WEBHOOK_PATH` — Paramètres du serveur de webhook
- `NEXTCLOUD_ALLOWED_ROOMS` — Tokens de salons autorisés

<div id="tlon-urbit">

### Tlon (Urbit)

</div>

**Obtenir les identifiants :** Votre accès au vaisseau Urbit
**Minimum requis :** `TLON_SHIP` + `TLON_URL` + `TLON_CODE`
**Variables :**
- `TLON_SHIP` — Nom de votre vaisseau (ex. `~sampel-palnet`)
- `TLON_URL` — URL de votre vaisseau (ex. `http://localhost:8080`)
- `TLON_CODE` — Code d'accès de votre vaisseau (depuis `+code` dans Dojo)
- `TLON_GROUP_CHANNELS` — Canaux à écouter (format de chemin de groupe)
- `TLON_DM_ALLOWLIST` — Expéditeurs de MP autorisés
- `TLON_AUTO_DISCOVER_CHANNELS` — Rejoindre automatiquement les canaux

<div id="zalo-vietnam-messaging">

### Zalo (Messagerie vietnamienne)

</div>

**Obtenir les identifiants :** https://developers.zalo.me
**Minimum requis :** `ZALO_APP_ID` + `ZALO_SECRET_KEY` + `ZALO_ACCESS_TOKEN`
**Variables :**
- `ZALO_APP_ID` / `ZALO_SECRET_KEY` — Depuis le portail développeurs Zalo
- `ZALO_ACCESS_TOKEN` / `ZALO_REFRESH_TOKEN` — Tokens OAuth de Zalo
- `ZALO_WEBHOOK_URL` / `ZALO_WEBHOOK_PATH` / `ZALO_WEBHOOK_PORT` — Configuration du webhook

<div id="zalo-user-personal">

### Zalo User (Personnel)

</div>

Connecteur de compte Zalo personnel (non officiel, aucune clé API nécessaire).
**Variables :**
- `ZALOUSER_COOKIE_PATH` — Chemin vers les cookies de session Zalo exportés
- `ZALOUSER_IMEI` — IMEI de l'appareil pour la session (depuis l'app Zalo officielle)
- `ZALOUSER_USER_AGENT` — Chaîne user agent du navigateur
- `ZALOUSER_PROFILES` — Profils de comptes multiples (JSON)
- `ZALOUSER_ALLOWED_THREADS` — Fils de conversation autorisés
- `ZALOUSER_DM_POLICY` / `ZALOUSER_GROUP_POLICY` — Politiques de messages

<div id="acp-agent-communication-protocol">

### ACP (Agent Communication Protocol)

</div>

Protocole interne d'agent à agent pour connecter plusieurs agents IA.
**Variables :**
- `ACP_GATEWAY_URL` — URL de la gateway pour le hub ACP
- `ACP_GATEWAY_TOKEN` / `ACP_GATEWAY_PASSWORD` — Identifiants d'authentification
- `ACP_DEFAULT_SESSION_KEY` / `ACP_DEFAULT_SESSION_LABEL` — Identification de session
- `ACP_CLIENT_NAME` / `ACP_CLIENT_DISPLAY_NAME` — Identité de cet agent
- `ACP_AGENT_ID` — ID unique de l'agent
- `ACP_PERSIST_SESSIONS` — `true` pour sauvegarder les sessions entre les redémarrages
- `ACP_SESSION_STORE_PATH` — Où sauvegarder les sessions

<div id="mcp-model-context-protocol">

### MCP (Model Context Protocol)

</div>

Connectez-vous à n'importe quel serveur MCP pour des capacités d'outils étendues.
**Variables :**
- `mcp` — Objet de configuration JSON pour les serveurs MCP
**Conseils :** Les serveurs MCP peuvent fournir des outils (recherche web, exécution de code, accès aux fichiers, bases de données, etc.) directement à l'IA. Voir https://modelcontextprotocol.io pour les serveurs disponibles.

<div id="iq-solana-on-chain">

### IQ (Solana On-chain)

</div>

Chat on-chain via la blockchain Solana.
**Minimum requis :** `SOLANA_PRIVATE_KEY` + `IQ_GATEWAY_URL`
**Variables :**
- `SOLANA_PRIVATE_KEY` — Clé privée du portefeuille Solana (encodée en base58)
- `SOLANA_KEYPAIR_PATH` — Alternative : chemin vers le fichier JSON de la paire de clés
- `SOLANA_RPC_URL` — ex. `https://api.mainnet-beta.solana.com`
- `IQ_GATEWAY_URL` — URL de la gateway du protocole IQ
- `IQ_AGENT_NAME` — Nom d'affichage de votre agent
- `IQ_DEFAULT_CHATROOM` — Salon de discussion par défaut à rejoindre
- `IQ_CHATROOMS` — Salons de discussion supplémentaires (séparés par des virgules)

<div id="gmail-watch">

### Gmail Watch

</div>

Surveille Gmail via les notifications push Google Pub/Sub.
**Configuration :** Nécessite un compte de service Google Cloud avec accès à l'API Gmail.
**Conseils :** Utilise `gog gmail watch serve` en interne. Nécessite un projet Google Cloud avec l'API Gmail activée et Pub/Sub configuré.

---

<div id="streaming-live-broadcasting">

## Streaming (Diffusion en direct)

</div>

<div id="enable-streaming-streaming-base">

### Activer le Streaming (streaming-base)

</div>

Ajoute l'onglet Stream à l'interface avec la gestion des destinations RTMP.
**Aucune configuration nécessaire** — activez simplement le plugin. Puis ajoutez les plugins de destination ci-dessous.

<div id="twitch-streaming">

### Streaming Twitch

</div>

**Obtenir les identifiants :** https://dashboard.twitch.tv → Paramètres → Stream
**Variable :** `TWITCH_STREAM_KEY` — Votre clé de stream (gardez-la secrète !)
**Conseils :** Ne partagez jamais votre clé de stream — elle permet à n'importe qui de diffuser sur votre chaîne. Régénérez-la si elle est compromise.

<div id="youtube-streaming">

### Streaming YouTube

</div>

**Obtenir les identifiants :** https://studio.youtube.com → Passer en direct → Paramètres du stream
**Variables :**
- `YOUTUBE_STREAM_KEY` — Depuis YouTube Studio → Clé de stream
- `YOUTUBE_RTMP_URL` — Par défaut : `rtmp://a.rtmp.youtube.com/live2` (rarement besoin de changer)
**Conseils :** Vous avez besoin d'une chaîne YouTube avec le Streaming en direct activé (peut nécessiter une vérification par téléphone).

<div id="x-streaming">

### Streaming X

</div>

Diffusez en direct sur X en utilisant les identifiants RTMP générés pour la diffusion active.
**Obtenir les identifiants :** Depuis X Live Producer / Media Studio lorsque vous créez un stream en direct
**Variables :**
- `X_STREAM_KEY` — Clé de stream pour la diffusion
- `X_RTMP_URL` — URL d'ingestion RTMP pour la session de diffusion
**Conseils :** Les identifiants RTMP de X sont souvent par diffusion. Créez d'abord le stream, puis copiez les deux valeurs directement dans le plugin.

<div id="pumpfun-streaming">

### Streaming pump.fun

</div>

Diffusez sur pump.fun en utilisant les identifiants d'ingestion RTMP de la plateforme.
**Obtenir les identifiants :** Depuis le flux de streaming en direct de pump.fun lorsque vous créez un stream
**Variables :**
- `PUMPFUN_STREAM_KEY` — Clé de stream pour l'ingestion pump.fun
- `PUMPFUN_RTMP_URL` — URL d'ingestion RTMP pour le stream en cours
**Conseils :** Traitez les deux valeurs comme des identifiants de session. Si le stream refuse de démarrer, recréez la diffusion et collez des valeurs fraîches.

<div id="custom-rtmp">

### Custom RTMP

</div>

Diffusez sur n'importe quelle plateforme (Facebook, TikTok, Kick, RTMP auto-hébergé, etc.)
**Variables :**
- `CUSTOM_RTMP_URL` — URL du endpoint RTMP, ex. `rtmp://live.kick.com/app`
- `CUSTOM_RTMP_KEY` — Clé de stream de la plateforme
**URLs RTMP courantes :**
- Facebook Live : `rtmps://live-api-s.facebook.com:443/rtmp/`
- TikTok : `rtmp://push.tiktokcdn.com/third/` (accès TikTok Live nécessaire)
- Kick : `rtmp://ingest.global-contribute.live-video.net/app`

---

<div id="general-tips">

## Conseils généraux

</div>

**Requis vs Optionnel :** Chaque plugin a des champs minimum requis. Commencez avec ceux-là uniquement — vous pouvez ajouter des paramètres optionnels plus tard.

**Tester avant la mise en ligne :** La plupart des connecteurs ont un mode "essai à blanc" (ex. `TWITTER_DRY_RUN=true`, `FARCASTER_DRY_RUN=true`, `BLUESKY_DRY_RUN=true`) — utilisez-le pour vérifier la configuration sans publier.

**Champs de politique :** La plupart des connecteurs ont des champs `DM_POLICY` et `GROUP_POLICY` :
- `allow-all` — répondre à tout le monde
- `allow-from` — répondre uniquement aux comptes de la liste `ALLOW_FROM`
- `deny-all` — ne jamais répondre (désactive effectivement ce type de canal)

**Webhook vs Polling :** Les connecteurs comme LINE, Twilio, WhatsApp Cloud API et Google Chat utilisent des webhooks (ils envoient les messages à votre serveur). Vous avez besoin d'une URL accessible publiquement. Utilisez ngrok pour le développement local : `ngrok http 3000`.

**Limites de débit :** La plupart des plateformes imposent des limites de débit. Pour Twitter en particulier, utilisez des intervalles de publication conservateurs (minimum 90-180 minutes).
