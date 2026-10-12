# michi

> Le plan en cours, toujours sous les yeux : un mod Claude Code qui affiche au-dessus du prompt
> l'étape active, le chemin parcouru et ce que Claude est en train de faire.

```text
◆ Migrer l'authentification · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Écriture des tests
```

|              |                                            |
| ------------ | ------------------------------------------ |
| Version      | 0.1.0                                      |
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

## Fonctionnement

### Ce que le mod écoute

| Outil          | Effet sur le plan                                                               |
| -------------- | ------------------------------------------------------------------------------- |
| `TodoWrite`    | Remplace toute la liste. Une liste vide efface le plan.                         |
| `TaskCreate`   | Ajoute une étape à faire.                                                       |
| `TaskUpdate`   | Change le statut, l'intitulé ou la forme active d'une étape ; `deleted` la retire. |
| `ExitPlanMode` | Donne son titre au plan, une fois celui-ci accepté.                             |

Chaque appel est d'abord exécuté normalement. Le mod n'en retient l'effet qu'ensuite, et seulement si :

- l'appel vient de la session principale (ceux des subagents sont ignorés) ;
- l'outil n'a été ni refusé ni mis en erreur (un plan rejeté ne change donc rien) ;
- pour `TaskUpdate`, l'outil n'a pas répondu que la tâche est inconnue.

Le mod ne modifie jamais un appel ni son résultat : Claude lit exactement ce qu'il lirait sans lui.

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

Le mod n'appelle que quatre fonctions de l'API des mods : `$.command.register`, `$.state`
(lecture et écriture de sa seule clé `michi.plan`), `$.ui.open` et `$.ui.resolve`.

Il ne lit ni n'écrit aucun fichier, ne lance aucun processus, ne fait aucun appel réseau et
n'interroge aucun modèle. Des appels d'outils, il ne voit que ceux des quatre outils de plan.

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
refusés ou en erreur, les subagents, la troncature et la remise à zéro.

Conventions du code : vocabulaire du domaine en français, termes techniques en anglais ; aucune
dépendance externe ; tout ce qui se calcule sans le moteur vit dans `hooks/plan.ts`.

## Dépannage

**Le mod ne se charge pas.** Vérifier la version (`claude --version`), puis la liste des mods actifs
dans `/plugin`. `claude --debug` écrit dans le journal la raison d'un chargement refusé.

**La bande n'apparaît pas.** Elle ne s'affiche qu'à partir de la première étape : un plan validé
mais sans tâche ne montre rien. Elle peut aussi être repliée (`Ctrl+X` puis `Ctrl+A`), ou cédée à
une enquête de Claude Code.

**La bande ne suit pas le plan.** Ajouter temporairement ce hook dans `register` : il écrit dans le
transcript chaque appel d'outil de plan, avec ses arguments et son résultat. À retirer ensuite.

```ts
on('tool.call', { tool: /^(TodoWrite|Task|ExitPlanMode)/ }, async ($, e, next) => {
  const ran = await next(e)

  $.ui.log(`${e.tool} ${JSON.stringify(e)} -> ${JSON.stringify(ran)}`)

  return ran
})
```

## Limites connues

- **Version 0.1.0.** Le mod est validé par ses tests automatisés avec Claude Code 2.1.295 ; son rendu
  n'a pas encore été contrôlé visuellement dans une session réelle.
- **Tâches antérieures au mod.** Les tâches créées avant son chargement, ou reprises par `/resume`,
  lui sont inconnues : la bande reparaît à la prochaine création de tâche.
- **Titre.** Il ne vient que d'un plan validé en mode plan ; sans cela, la bande affiche `Plan`.
- **Surfaces.** La bande et le panneau se dessinent dans le terminal et l'app desktop. Ailleurs
  (extension VS Code, `claude -p`, SDK), le mod suit le plan mais n'affiche rien.
- **Largeur des caractères.** Elle est estimée sans table Unicode complète : deux cellules pour le
  CJK et les emoji, une pour le reste.
