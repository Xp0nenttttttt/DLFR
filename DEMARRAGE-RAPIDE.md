# Déployer la V2.0 sur GitHub Pages

**Avant tout :** effectuer un commit de sauvegarde du dépôt actuel.

## Mise à jour depuis la V1.2

1. Télécharger le ZIP « patch V2.0 ».
2. Dans le dépôt GitHub, remplacer `index.html`, `css/style.css` et `js/app.js`.
3. Ajouter `js/v2-core.js` et `js/v2-demo.js`.
4. Ne pas écraser `js/config.js`, sauf si vous voulez volontairement modifier la configuration Supabase.
5. Publier le commit et ouvrir `https://TON-PSEUDO.github.io/DLFR/?demo=1`.
6. Faire les essais avec le bouton « Modération » > « Activer la simulation modérateur ».

**Sans accès SQL :** aucun script SQL nécessaire pour tester la démonstration.

**Ne pas importer** `supabase/04_v2_PREPARATION_NE_PAS_EXECUTER.sql` : il décrit seulement une migration future à réviser.

La démo est sauvegardée dans le navigateur et peut être exportée/réimportée au format JSON. Les essais n'affectent pas votre base Supabase ni l'ancien site.
