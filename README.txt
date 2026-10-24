DLFR V76 - correctif d'affichage des premiers records

Base: V75.
Remplacer seulement js/level-cinema.js.

- Affiche un champ séparé Premier record français daté si first_fr_player existe.
- Si un seul record 100% est enregistré, le montre comme « Record français enregistré » sans prétendre que c'est historiquement le premier.
- Laisse la vérification « À renseigner » tant que le vrai vérificateur n'est pas renseigné ou validé.
- Les champs Création et Publication ne sont pas déductibles d'une soumission de record.
- Pas de modification SQL; aucun drapeau touché.

Important: ce correctif agit seulement sur l'affichage. Si tu souhaites enregistrer le premier victor officiel dans first_fr_player lors de l'acceptation, il faudra adapter la fonction SQL dlfr_review_existing_record et vérifier les sources/date historique avant de procéder.
