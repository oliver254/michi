# michi

> Le plan en cours, toujours sous les yeux : un mod Claude Code qui affiche au-dessus du prompt
> l'étape active, le chemin parcouru et ce que Claude est en train de faire.

```text
◆ Migrer l'authentification · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Écriture des tests
```

|              |                                            |
| ------------ | ------------------------------------------ |
| Version      | 0.3.0                                      |
| Claude Code  | 2.1.287 ou plus récent                     |
| Surfaces     | terminal, app desktop (onglet Code)        |
| Dépendances  | aucune                                     |

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Fonctionnement](#fonctionnement)
- [Ce que le mod touche](#ce-que-le-mod-touche)
- [Développement](#développement)
- [Dépannage](#dépannage)
- [Limites connues](#limites-connues)

## Fonctionnalités

- **Bande permanente au-dessus du prompt**, sur une seule ligne : titre du plan, numéro d'étape,
  barre de progression, activité du moment.
- **Commande `/michi`** : ouvre un panneau avec la liste complète des étapes. Elle répond
  immédiatement, même pendant que Claude travaille.
- **Suivi automatique** : le mod lit les outils de plan de Claude Code (`TodoWrite`, `TaskCreate`,
  `TaskUpdate`, `ExitPlanMode`). Rien à saisir, rien à configurer.
- **Mode plan** : quand vous validez un plan en mode plan, Claude déclare ses étapes au mod et les
  tient à jour ; la jauge suit. Là où Claude Code n'offre plus d'outil de tâches, le mod fournit le
  sien.
- **Plans Superpowers** : quand la session ouvre un plan écrit par
  [Superpowers](https://github.com/obra/superpowers), la jauge devient celle de ce plan, avec ses
  tâches et l'avancement consigné dans son registre.
- **Discret** : rien n'est affiché tant qu'il n'y a pas de plan, la ligne s'adapte à la largeur
  disponible, et ce que dessinent les autres mods reste visible.
- **Fiable** : seuls comptent les appels qui ont réellement abouti, et seulement ceux de la session
  principale. Les plans des subagents ne polluent pas l'affichage.

## Installation

### Prérequis

Claude Code **2.1.287 ou plus récent** :

```bash
claude --version
```

L'app desktop embarque sa propre copie de Claude Code ; la version s'y lit avec `/status`.

### Essayer le temps d'une session

Depuis le dossier parent du dépôt :

```bash
claude --plugin-dir ./michi
```

Depuis le dépôt lui-même, c'est `claude --plugin-dir .`. Le module est rechargé à chaque sauvegarde.

### Installer durablement

Le dépôt est sa propre marketplace, nommée `michi-local`. Depuis le dossier parent :

```bash
claude plugin marketplace add ./michi
```

```bash
claude plugin install michi@michi-local
```

Dans une session déjà ouverte, `/reload-plugins` charge le mod. La marketplace pointe sur le dossier :
si celui-ci est déplacé ou supprimé, le mod ne se charge plus.

Pour le retirer :

```bash
claude plugin uninstall michi@michi-local
```

```bash
claude plugin marketplace remove michi-local
```

### App desktop

Un mod installé depuis le terminal au niveau utilisateur se charge aussi dans l'onglet Code.
Sans passer par le terminal, indiquer le chemin absolu du dépôt dans `~/.claude/settings.json` :

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\chemin\\vers\\michi"
  }
}
```

## Utilisation

### Lire la bande

```text
◆ Migrer l'authentification · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Écriture des tests
  └────────── titre ──────┘   └─ étape ─┘ └ barre ┘   └──── activité ────┘
```

| Élément  | Signification                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------- |
| Titre    | Première ligne du plan validé en mode plan. `Plan` tant qu'aucun plan n'a été validé.          |
| Étape    | Étapes terminées **plus** étapes en cours, sur le total. C'est le nombre de cases pleines.     |
| Barre    | Une case par étape : terminée, en cours (jaune), à faire (`▱`). Au-delà de 10 étapes, la barre est ramenée à 10 cases. |
| Activité | `▶` forme active de l'étape en cours · `○` prochaine étape quand rien n'est en cours · `✔ terminé`. |

Quand plusieurs étapes sont menées en parallèle, la bande montre la première et compte les autres :
`▶ Écriture des tests (+1)`.

Sur une bande étroite, le libellé est coupé (`…`) pour tenir sur une ligne ; si la place manque
encore, la barre s'efface, puis le titre.

### Voir toutes les étapes

```text
/michi
```

```text
◆ Migrer l'authentification · 2/7
✔ Lire le code existant
✔ Écrire le parseur
▶ Écrire les tests
○ Brancher la CLI
○ Migrer les sessions
○ Documenter
○ Livrer
```

Les étapes terminées sont estompées, l'étape en cours est en gras et en jaune. Le panneau se met à
jour tout seul ; il se ferme avec sa croix ou `Ctrl+X` puis `X`.

### Suivre un plan validé en mode plan

Rien à faire de plus : validez le plan comme d'habitude. Claude appelle alors l'outil du mod avec
une étape par étape du plan, puis le rappelle chaque fois qu'une étape commence ou se termine.

```text
◆ Migrer l'authentification · étape 2/4 · ▰▰▱▱ · ▶ Correction du bug
```

Le titre est la première ligne du plan validé. La bande apparaît au premier appel de l'outil, donc
quelques instants après la validation, et non à la validation même.

### Suivre un plan Superpowers

Rien à faire de plus : dès que la session lit, écrit ou modifie un document
`docs/superpowers/plans/<nom>.md` (ce que font les skills `writing-plans`, `executing-plans` et
`subagent-driven-development`), la bande et le panneau montrent ce plan.

```text
◆ T3 — Favoris, filtres, fraîcheur · étape 21/50 · ▰▰▰▰▰▱▱▱▱▱ · ▶ F4 — Le filtre appliqué
```

- Le **titre** est celui du document, sans la mention « Implementation Plan » ou « plan d'implémentation ».
- Les **étapes** sont les tâches du plan (`### Task 3: …`, `## Task F10a : …`, `### Tâche 1 — …`).
  Un identifiant qui n'est pas un simple numéro reste affiché devant le nom.
- Une tâche est **terminée** quand le registre du plan le dit (`Task F4: complete`) ou que toutes ses
  cases sont cochées ; elle est **en cours** quand le registre en parle sans la clore, ou qu'une partie
  de ses cases est cochée.

## Fonctionnement

### Ce que le mod écoute

| Outil          | Effet sur le plan                                                               |
| -------------- | ------------------------------------------------------------------------------- |
| `TodoWrite`    | Remplace toute la liste. Une liste vide efface le plan.                         |
| `TaskCreate`   | Ajoute une étape à faire.                                                       |
| `TaskUpdate`   | Change le statut, l'intitulé ou la forme active d'une étape ; `deleted` la retire. |
| `ExitPlanMode` | Donne son titre au plan, une fois celui-ci accepté.                             |
| `mcp__michi__steps` | L'outil du mod : remplace toute la liste, comme `TodoWrite`.               |

Chaque appel est d'abord exécuté normalement. Le mod n'en retient l'effet qu'ensuite, et seulement si :

- l'appel vient de la session principale (ceux des subagents sont ignorés) ;
- l'outil n'a été ni refusé ni mis en erreur (un plan rejeté ne change donc rien) ;
- pour `TaskUpdate`, l'outil n'a pas répondu que la tâche est inconnue.

Le mod ne modifie ni les arguments ni le résultat des outils de Claude Code. Il ajoute en revanche
deux choses à ce que Claude lit, décrites ci-dessous.

### Mode plan : l'outil d'étapes

Un plan du mode plan est un texte libre, et aucun outil de Claude Code ne dit où en est son
exécution. Les versions récentes n'offrent plus non plus d'outil de tâches : ni `TaskCreate` ni
`TodoWrite` dans les sessions observées avec Claude Code 2.1.295 et 2.1.296. Sans rien d'autre, un
plan validé ne donnerait donc qu'un titre.

Le mod comble ce manque, et seulement là où il existe :

| Moment                    | Ce que fait le mod                                                         |
| ------------------------- | -------------------------------------------------------------------------- |
| Démarrage de la session   | Si la session n'a ni `TaskCreate` ni `TodoWrite`, il déclare son outil, `mcp__michi__steps`. |
| Plan validé (`ExitPlanMode`) | Dans le même cas, il ajoute au résultat une consigne que seul Claude lit : déclarer une étape par étape du plan, puis tenir la liste à jour. |
| Appel de l'outil          | Il remplace la liste des étapes et répond à Claude où en est la jauge.     |

L'outil prend la liste entière à chaque appel : `content` (l'intitulé), `status` (`pending`,
`in_progress`, `completed`) et, au choix, `activeForm` (ce qui s'affiche pendant l'étape). Une liste
mal formée est refusée, et Claude en lit la raison. Une liste vide efface la jauge.

Dans une session qui a déjà un outil de tâches, le mod ne déclare rien et n'ajoute aucune consigne :
c'est cet outil qui fait la jauge, comme avant.

### Plans Superpowers

Un plan Superpowers ne passe pas par le mode plan : c'est un document Markdown, et son avancement
s'écrit dans un registre, `.superpowers/sdd/<nom>/progress.md`, que l'exécuteur complète tâche après
tâche. Le mod s'appuie sur ces deux fichiers :

| Ce que fait la session principale                         | Ce que fait le mod                                         |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Elle lit, écrit ou modifie le document d'un plan          | Il lit le document et son registre, et en tire la jauge.   |
| Elle lance une commande ou modifie un fichier             | Il relit le registre du plan suivi, s'il y en a un.        |

Tant que le plan tient son registre, les tâches de la session (`TaskCreate`, `TodoWrite`, l'outil
du mod) ne modifient plus la jauge : c'est le plan qui fait foi, et l'outil du mod le dit à Claude. Sans registre ni case cochée, les tâches du
document ne sont qu'un aperçu, que les tâches de la session remplacent en gardant le titre.

Une tâche vue terminée le reste, même quand l'exécuteur supprime le registre à la fin du plan.

### Quand un plan en remplace un autre

- Une tâche créée alors que toutes les étapes sont terminées ouvre un **nouveau plan**, sans l'ancien titre.
- Un plan validé alors que le précédent est terminé repart d'une liste vide.
- Tant qu'il reste une étape à faire, les nouvelles tâches s'ajoutent au plan en cours.

### Durée de vie de l'état

Le plan est gardé dans l'état de session de Claude Code (`$.state`) :

| Événement                        | Le plan…                |
| -------------------------------- | ----------------------- |
| Rechargement du mod              | est conservé            |
| Compaction de la conversation    | est conservé            |
| `/clear`, `/resume`, `/branch`   | repart de zéro          |
| Fin de la session                | disparaît               |

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

## Développement

```text
michi/
├── .claude-plugin/
│   ├── plugin.json         manifeste du plugin
│   └── marketplace.json    marketplace locale (michi-local)
├── hooks/
│   ├── hooks.json          désigne le module de hooks
│   ├── register.ts         hooks : capture, bande, commande, panneau
│   └── plan.ts             logique pure : transitions, largeur, mise en forme
├── types/
│   └── index.d.ts          contrat de l'état ($.state)
└── tests/
    ├── plan.test.ts        la logique seule
    └── michi.test.ts       le mod à travers le moteur de test
```

Valider le manifeste et le module, avertissements compris :

```bash
claude plugin validate . --strict
```

Lancer les tests (sans session, sans réseau) :

```bash
claude plugin test .
```

Les tests couvrent la création du plan, le passage d'une tâche en cours puis terminée, la fin du
plan, l'absence de plan, le rendu de la bande et du panneau sur `terminal` et `desktop`, les appels
refusés ou en erreur, les subagents, la troncature, la remise à zéro, le suivi d'un plan
Superpowers (document, registre, cases cochées) et l'outil d'étapes (déclaration, consigne à la
validation du plan, liste mal formée, session qui a déjà un outil de tâches).

Conventions du code : identifiants en anglais, commentaires et textes affichés en français ; aucune
dépendance externe ; tout ce qui se calcule sans le moteur vit dans `hooks/plan.ts`.

## Dépannage

**Le mod ne se charge pas.** Vérifier la version (`claude --version`), puis la liste des mods actifs
dans `/plugin`. `claude --debug` écrit dans le journal la raison d'un chargement refusé.

**La bande n'apparaît pas.** Elle ne s'affiche qu'à partir de la première étape : un plan validé
ne montre rien tant que Claude n'a pas déclaré ses étapes. S'il ne le fait pas, lui demander
« déclare les étapes du plan avec `mcp__michi__steps` ». La bande peut aussi être repliée (`Ctrl+X`
puis `Ctrl+A`), ou cédée à une enquête de Claude Code.

**Claude n'a pas l'outil `mcp__michi__steps`.** Le mod le déclare au démarrage de la session : une
session ouverte avant l'installation ou la mise à jour du mod ne l'a pas. `/reload-plugins`, ou une
nouvelle session, le fait apparaître. Il est aussi absent, volontairement, d'une session qui a
`TaskCreate` ou `TodoWrite`.

**La bande ne suit pas le plan.** Ajouter temporairement ce hook dans `register` : il écrit dans le
transcript chaque appel d'outil de plan, avec ses arguments et son résultat. À retirer ensuite.

```ts
on('tool.call', { tool: /^(TodoWrite|Task|ExitPlanMode|mcp__michi__)/ }, async ($, e, next) => {
  const ran = await next(e)

  $.ui.log(`${e.tool} ${JSON.stringify(e)} -> ${JSON.stringify(ran)}`)

  return ran
})
```

## Limites connues

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
  Pendant qu'un exécutant travaille sans que le registre parle encore de sa tâche, la bande annonce
  cette tâche avec `○` et non `▶`.
- **Surfaces.** La bande et le panneau se dessinent dans le terminal et l'app desktop. Ailleurs
  (extension VS Code, `claude -p`, SDK), le mod suit le plan mais n'affiche rien.
- **Largeur des caractères.** Elle est estimée sans table Unicode complète : deux cellules pour le
  CJK et les emoji, une pour le reste.
