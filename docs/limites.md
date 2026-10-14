# Limites connues

[← Retour au README](../README.md)

- **Version 0.3.0.** Le mod est validé par ses tests automatisés avec Claude Code 2.1.296 ; son rendu
  n'a pas encore été contrôlé visuellement dans une session réelle.
- **Mode plan.** La jauge dépend de Claude : s'il ne suit pas la consigne, ou cesse d'appeler l'outil
  en cours de route, la bande n'apparaît pas ou n'avance plus. Le chargement de l'outil a été vérifié
  dans une session réelle (2.1.296) ; son appel par Claude ne l'a pas encore été.
- **Tâches antérieures au mod.** Les tâches créées avant son chargement, ou reprises par `/resume`,
  lui sont inconnues : la bande reparaît à la prochaine création de tâche.
- **Titre.** Il vient d'un plan validé en mode plan ou d'un document Superpowers ; sans cela, la
  bande affiche `Plan`.
- **Plans Superpowers.** Seul l'emplacement par défaut `docs/superpowers/plans/` est reconnu. Le suivi
  commence quand la session touche le document du plan : lire seulement le registre ne suffit pas.
  Pendant que les étapes de la session sont en cours, il faut même qu'elle écrive ou modifie le
  document : un plan Superpowers exécuté à ce moment-là, sans écrire ni modifier son document, ne
  prend pas la jauge.
  Pendant qu'un exécutant travaille sans que le registre parle encore de sa tâche, la bande annonce
  cette tâche avec `○` et non `▶`.
- **Surfaces.** La bande et le panneau se dessinent dans le terminal et l'app desktop. Ailleurs
  (extension VS Code, `claude -p`, SDK), le mod suit le plan mais n'affiche rien.
- **Largeur des caractères.** Elle est estimée sans table Unicode complète : deux cellules pour le
  CJK et les emoji, une pour le reste.
