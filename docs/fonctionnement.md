# Fonctionnement

[← Retour au README](../README.md)

Cette page décrit ce que michi écoute, comment il en tire le plan affiché, et ce qu'il touche.

- [Ce que le mod écoute](#ce-que-le-mod-écoute)
- [Mode plan : l'outil d'étapes](#mode-plan--loutil-détapes)
- [Plans Superpowers](#plans-superpowers)
- [Quand un plan en remplace un autre](#quand-un-plan-en-remplace-un-autre)
- [Durée de vie de l'état](#durée-de-vie-de-létat)
- [Ce que le mod touche](#ce-que-le-mod-touche)

## Ce que le mod écoute

| Outil               | Effet sur le plan                                                                  |
| ------------------- | ---------------------------------------------------------------------------------- |
| `TodoWrite`         | Remplace toute la liste. Une liste vide efface le plan.                            |
| `TaskCreate`        | Ajoute une étape à faire.                                                          |
| `TaskUpdate`        | Change le statut, l'intitulé ou la forme active d'une étape ; `deleted` la retire. |
| `ExitPlanMode`      | Donne son titre au plan, une fois celui-ci accepté.                                |
| `mcp__michi__steps` | L'outil du mod : remplace toute la liste, comme `TodoWrite`.                       |

Chaque appel est d'abord exécuté normalement. Le mod n'en retient l'effet qu'ensuite, et seulement si :

- l'appel vient de la session principale (ceux des subagents sont ignorés) ;
- l'outil n'a été ni refusé ni mis en erreur (un plan rejeté ne change donc rien) ;
- pour `TaskUpdate`, l'outil n'a pas répondu que la tâche est inconnue.

Le mod ne modifie ni les arguments ni le résultat des outils de Claude Code. Il ajoute en revanche
deux choses à ce que Claude lit, décrites ci-dessous.

## Mode plan : l'outil d'étapes

Un plan du mode plan est un texte libre, et aucun outil de Claude Code ne dit où en est son
exécution. Et les sessions observées n'offraient aucun outil de tâches : ni `TaskCreate` ni
`TodoWrite`, dans l'app desktop (Claude Code 2.1.295) comme avec `claude -p` (2.1.296). Sans rien
d'autre, un plan validé n'y donnerait donc qu'un titre.

Le mod comble ce manque, et seulement là où il existe :

| Moment                        | Ce que fait le mod                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Démarrage de la session       | Si la session n'a ni `TaskCreate` ni `TodoWrite`, il déclare son outil, `mcp__michi__steps`.                                                 |
| Plan validé (`ExitPlanMode`)  | Dans le même cas, il ajoute après le résultat une consigne que seul Claude lit : déclarer une étape par étape du plan, puis tenir la liste à jour. |
| Appel de l'outil              | Il remplace la liste des étapes et répond à Claude où en est la jauge.                                                                       |

L'outil prend la liste entière à chaque appel :

| Champ        | Obligatoire | Valeurs                                                                                   |
| ------------ | :---------: | ----------------------------------------------------------------------------------------- |
| `content`    | oui         | L'intitulé de l'étape, non vide.                                                          |
| `status`     | oui         | `pending`, `in_progress` ou `completed`.                                                  |
| `activeForm` | non         | Ce qui s'affiche pendant que l'étape est en cours. Absente, nulle ou vide : l'intitulé. |

Une liste mal formée est refusée, et Claude en lit la raison. Une liste vide efface la jauge ; pendant
le simple aperçu d'un plan Superpowers, elle le laisse en place, et la réponse le dit.

L'outil figure aussi dans la liste d'outils des subagents : l'API des mods ne permet pas de le
réserver à la session principale. Sa description le dit, et leurs appels reçoivent une réponse sans
rien changer.

Le titre est la première ligne du plan validé. La bande apparaît au premier appel de l'outil, donc
quelques instants après la validation, et non à la validation même.

Dans une session qui a déjà un outil de tâches, le mod ne déclare rien et n'ajoute aucune consigne :
c'est cet outil qui fait la jauge.

## Plans Superpowers

Un plan [Superpowers](https://github.com/obra/superpowers) ne passe pas par le mode plan : c'est un
document Markdown, `docs/superpowers/plans/<nom>.md`, et son avancement s'écrit dans un registre,
`.superpowers/sdd/<nom>/progress.md`, que l'exécuteur complète tâche après tâche. Le mod s'appuie sur
ces deux fichiers :

| Ce que fait la session principale                  | Ce que fait le mod                                       |
| -------------------------------------------------- | -------------------------------------------------------- |
| Elle lit, écrit ou modifie le document d'un plan   | Il lit le document et son registre, et en tire la jauge. |
| Elle lance une commande ou modifie un fichier      | Il relit le registre du plan suivi, s'il y en a un.      |

Les skills `writing-plans`, `executing-plans` et `subagent-driven-development` touchent toutes le
document du plan : le suivi démarre donc sans intervention.

### Lecture du document

- Le **titre** est celui du document, sans la mention « Implementation Plan » ou « plan d'implémentation ».
- Les **étapes** sont les tâches du plan (`### Task 3: …`, `## Task F10a : …`, `### Tâche 1 — …`).
  Un identifiant qui n'est pas un simple numéro reste affiché devant le nom.
- Une tâche est **terminée** quand le registre le dit (`Task F4: complete`) ou que toutes ses cases
  sont cochées.
- Elle est **en cours** quand le registre en parle sans la clore, ou qu'une partie de ses cases est
  cochée.

### Priorité sur les tâches de la session

Tant que le plan tient son registre, les tâches de la session (`TaskCreate`, `TodoWrite`, l'outil
du mod) ne modifient plus la jauge : c'est le plan qui fait foi, et l'outil du mod le dit à Claude.
Sans registre ni case cochée, les tâches du document ne sont qu'un aperçu, que les tâches de la
session remplacent en gardant le titre.

Dans l'autre sens, quand les étapes de la session sont en cours (il en reste à faire), une simple
**lecture** du document ne change rien à la jauge : lire un plan pour s'informer n'est pas
l'exécuter. Seule une écriture ou une modification du document compte alors. Elle lui donne la
jauge si le plan tient un registre ou a des cases cochées ; sinon, le document ne fait que nommer
le plan en cours.

Une tâche vue terminée le reste, même quand l'exécuteur supprime le registre à la fin du plan.

## Quand un plan en remplace un autre

- Une tâche créée, ou une liste neuve déclarée, alors que toutes les étapes sont terminées ouvre un
  **nouveau plan**, sans l'ancien titre.
- Une liste qui reprend toutes les étapes du plan terminé et en ajoute d'autres le **prolonge** : il
  garde son titre.
- Un plan validé alors que le précédent est terminé repart d'une liste vide.
- Dans une session sans outil de tâches, un plan validé repart toujours d'une liste vide, même si le
  précédent n'est pas terminé : Claude déclare ensuite les étapes du nouveau plan.
- Tant qu'il reste une étape à faire, les nouvelles tâches s'ajoutent au plan en cours.
- Un plan validé en mode plan met fin au suivi d'un plan Superpowers.

## Durée de vie de l'état

Le plan est gardé dans l'état de session de Claude Code (`$.state`), sous la seule clé `michi.plan` :

| Événement                      | Le plan…       |
| ------------------------------ | -------------- |
| Rechargement du mod            | est conservé   |
| Compaction de la conversation  | est conservé   |
| `/clear`, `/resume`, `/branch` | repart de zéro |
| Fin de la session              | disparaît      |

## Ce que le mod touche

Le mod n'appelle que sept fonctions de l'API des mods : `$.command.register`, `$.state`
(lecture et écriture de sa seule clé `michi.plan`), `$.ui.open`, `$.ui.resolve`, `$.fs.read`,
`$.tool.list` et `$.tool.register`.

- **Fichiers lus** : uniquement le document du plan Superpowers que la session vient d'ouvrir, et son
  registre. Sans plan Superpowers, aucun fichier n'est lu.
- **Appels d'outils vus** : les quatre outils de plan, l'outil du mod, et `Read`, `Write`, `Edit` et
  `Bash`. De ces quatre derniers, le mod ne retient rien : il regarde seulement si le fichier touché
  est un document de plan, et s'en sert comme signal pour relire le registre.
- **Ce que Claude lit en plus** : dans une session sans outil de tâches, la description de
  `mcp__michi__steps` dans sa liste d'outils, et une consigne de trois phrases après chaque plan
  validé. Rien dans une session qui a déjà un outil de tâches.
- **Liste des outils** : le mod la consulte au démarrage et à chaque plan validé, pour savoir si la
  session a un outil de tâches. Il n'en retient que cette réponse.
- **Jamais** : écrire un fichier, lancer un processus, appeler le réseau ou interroger un modèle.

Vous pouvez le vérifier sans lancer le mod : les lignes `hooks:` et `calls:` de la commande
ci-dessous listent tout ce qu'il écoute et tout ce qu'il appelle.

```bash
claude plugin validate .
```
