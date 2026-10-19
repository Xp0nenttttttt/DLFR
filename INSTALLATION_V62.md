# DLFR V62 — Stabilisation des inscriptions et de la migration

Base : V61. Correctif cible, aucune suppression de comptes, aucune modification de drapeaux ni de records.

## Pourquoi ça bloquait

1. V57 comptait **les connexions et inscriptions sous la même clef IP** (`ip:<ip>`). Le plafond de 5/h utilise lors des inscriptions pouvait deja etre atteint par des connexions ordinaires. Une IP manquante prenait en outre la valeur commune `unknown`.
2. V57 exigeait 12 caracteres sur **l'ancien** mot de passe apres l'avoir pourtant reconnu en bcrypt. V62 essaie le mot de passe historique tel quel. Seule une politique de mots de passe Supabase incompatible oblige a en choisir un nouveau.
3. Le panneau Equipe affichait parfois « Compte DLFR » faute de fiche joueur associee, alors qu'un pseudo de connexion existait.
4. Les boutons communautaires occupaient trop de place dans l'en-tete.

## Installation — dans cet ordre

1. **Sauvegarder** les fichiers du site et garder un acces propriétaire Discord actif avant toute modification.
2. **Supabase Edge Function :** remplacer `supabase/functions/username-auth/index.ts` sur le projet.
3. Depuis le repertoire du projet :
   ```powershell
   npx supabase functions deploy username-auth --project-ref mcoaeocsthivggyspykf --no-verify-jwt
   ```
   Verifier que `ALLOWED_ORIGINS`, `AUTH_RATE_PEPPER` et les autres variables requises restent presentes. NE PAS changer `AUTH_RATE_PEPPER` : cela ne reinitialise pas seulement les compteurs, ca change les cles utilisees par la protection.
4. **GitHub Pages :** remplacer `js/username-auth.js`, `js/app.js`, `index.html` ; ajouter `css/v62-header.css`. Conserver toutes les autres ressources CSS/JS deja publiees, notamment V58, V59, V60.
5. **Supabase SQL Editor, facultatif** pour l'affichage des pseudos dans l'annuaire des comptes : executer `supabase/62_AFFICHER_PSEUDOS_COMPTES.sql` APRES la migration 49 et la creation de `dlfr_username_accounts` (migration 42).
6. Publier le site et recharger `Ctrl+F5`.

**Aucun SQL supplementaire pour reparer « Trop de tentatives »** : les cles de quota sont maintenant separees par action et par pseudo. Les quotas restent actifs (60 inscriptions / IP / h, 5 inscriptions / pseudo / 15 min ; 100 connexions / IP / h, 16 connexions / pseudo / 15 min). Si l'IP n'est pas fournie par l'infrastructure, le serveur s'appuie sur la limite par pseudo plutot que bloquer tous les visiteurs sous « unknown ». Ces plafonds ne garantissent pas que les limites natives de Supabase Auth seront absentes.

## Test conseillé (pas de mot de passe à partager)

- **Nouveau pseudo jamais utilise :** creer un compte avec un nouveau mot de passe de 12 caracteres ou plus ; confirmer la connexion.
- **Ancien compte deja importe :** sur l'ecran *Se connecter*, saisir l'ancien mot de passe **quelle que soit sa longueur**. Ne PAS cliquer sur *Creer un compte*.
- Si Supabase refuse le secret historique, ouvrir *Migration : choisir un nouveau mot de passe*, fournir l'ancien et le nouveau ; si la politique du projet est de 12 caracteres, choisir au moins 12 caracteres.
- **Compte Discord existant :** verifier qu'il conserve son profil et ses permissions ; ne pas utiliser l'inscription pour contourner la liaison.
- **Wardy :** executer `supabase/62_DIAGNOSTIC_WARDY_LECTURE_SEULE.sql` en SQL Editor. Ne pas transferer automatiquement une fiche ni remplacer le compte si le pseudo est deja occupe.
- **Panneau Équipe :** actualiser ; lorsqu'un compte possède un pseudo de connexion, il ne devrait plus apparaitre generiquement comme « Compte DLFR » (si SQL 62 installe).
- Verifier barre de navigation, Discord et YouTube, sur ordinateur et mobile.

## Limitations et securite

- L'ancien hash bcrypt reste cote serveur uniquement. Aucun hash exporte dans cette archive.
- Des anciens mots de passe trop faibles peuvent etre refuses par la politique Supabase ; V62 ne contourne PAS cette politique.
- Des conflits entre comptes Discord, DLFR et anciens identifiants doivent etre resolus avec verification de proprietaire ; ce patch ne fusionne pas les comptes automatiquement.
- Test statique et simulations locaux seulement : un vrai essai sur Supabase est necessaire.
