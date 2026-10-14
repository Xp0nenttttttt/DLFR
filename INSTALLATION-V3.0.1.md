# DLFR V3.0.1 — Réparer le bouton Discord « À CONFIGURER »

## Diagnostic établi sur le ZIP envoyé
- `js/config.js` contient `enableDiscordOAuth: true` et les paramètres publics de Supabase.
- `index.html` demandait pourtant `js/config.js?v=210` : une ancienne réponse peut être conservée en cache par le navigateur ou le CDN.
- `js/app.js` affiche « À CONFIGURER » uniquement quand la configuration effectivement chargée n'active pas Discord.
- La connexion e-mail/mot de passe ne correspond **pas** au mot de passe utilisé pour Supabase Dashboard.

## Installation
1. Décompresser à la racine du dépôt DLFR.
2. Remplacer `index.html` et `js/app.js`.
3. **Ne pas remplacer `js/config.js`** : le fichier local envoyé contient déjà le paramètre Discord à `true`.
4. Faire un commit et vérifier que GitHub Pages a déployé la dernière version.
5. Ouvrir `?page=my-profile` **sans `demo=1`**, et recharger avec Ctrl+F5.

Les nouveaux chemins dans `index.html` contiennent `js/config.js?v=301-discord` et `js/app.js?v=301-discord`.
Lorsque Discord est activé, l'écran met maintenant le bouton Discord en avant et cache le formulaire e-mail derrière « Autre méthode ».

## Si « À CONFIGURER » persiste
Sur le site déployé, dans la console navigateur, exécuter :

```js
console.table({
  supabasePresent: !!(window.DEMONLIST_CONFIG?.supabaseUrl && window.DEMONLIST_CONFIG?.supabasePublishableKey),
  discordActif: window.DEMONLIST_CONFIG?.enableDiscordOAuth === true,
  urlConfig: [...document.scripts].find(s => s.src.includes('/js/config.js'))?.src,
  modeDemo: sessionStorage.getItem('dlfr-preview-mode')
});
```

Ne jamais partager des clés secrètes, des jetons OAuth ou des captures de données confidentielles.
Si `discordActif` est `false`, vérifier le `js/config.js` **sur le dépôt déployé** et non seulement sur le PC.
Si le bouton apparaît mais la connexion échoue, revoir Authentication > Providers > Discord et les URL de redirection autorisées.

## Portée
- Deux fichiers de site modifiés seulement.
- Aucun changement de base SQL / droits de modération.
- Aucun changement au dossier `assets/flags/`, aucun drapeau inclus.
- Ne contient pas `js/config.js` ni de clé Supabase.
