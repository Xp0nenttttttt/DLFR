# DLFR 2.5 — Promotion d’un niveau NLW vers le Top 150

**Patch incrémental sur DLFR 2.4.** Aucun fichier dans `assets/flags/` n’est inclus ni modifié.

## Installation
1. **Sauvegarde Supabase** et les fichiers de ton site.
2. Exécute `supabase/38_PROMOUVOIR_NLW_VERS_TOP150.sql` dans Supabase SQL Editor. Elle **remplace** la fonction existante `dlfr_update_demon_full` en conservant les paramètres ; elle **ne change aucun rang à l’installation**.
3. Remplace uniquement `js/app.js` par celui de cette archive.
4. Recharge avec **Ctrl+F5**.

## Utilisation
1. Ouvre **Modération → Niveaux → Éditer les fiches**.
2. Choisis un niveau **NLW publié** (pas un import masqué ni un Legacy).
3. Dans **Position globale**, saisis le rang Top 150 désiré **de 1 à 150** : par exemple `40` (pas `190`).
4. Lis l’aperçu des changements de rang, coche la confirmation et saisis `TRANSFERER`.
5. Enregistre. Le serveur décale les positions affectées dans une transaction et conserve les complétions liées aux identifiants des niveaux.

## Effet sur les classements
Exemple : Shardscapes, position 155 (NLW #5), passe Top 150 #40. Les niveaux précédemment classés entre #40 et #154 sont décalés de +1. Le niveau au #150 devient NLW #1 s’il existe, et les autres rangs NLW affectés se décalent en conséquence. Les points des joueurs, qui dépendent de la position des niveaux, changent en conséquence. Ni niveau ni complétion ne sont supprimés.

**Restrictions :** seuls les supermodérateurs peuvent utiliser cet outil ; le transfert inverse Top 150 → NLW n’est pas inclus. Les niveaux UNRATED, Legacy et imports masqués sont exclus. Si une règle Supabase supplémentaire refuse l’opération, l’enregistrement est annulé atomiquement : communique le message d’erreur exact.

## Vérification SQL après un déplacement
```sql
SELECT id,name,position,is_public,legacy,unrated
FROM public.demons WHERE position BETWEEN 145 AND 158 ORDER BY position;
```

La migration a été contrôlée statiquement et le JavaScript vérifié en syntaxe, mais elle n’a **pas pu être exécutée sur ta base réelle Supabase**. Fais d’abord un test sur une copie de ta base.
