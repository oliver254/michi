<div align="center">

# michi

**Le plan en cours, toujours sous les yeux.**

Un mod Claude Code qui affiche au-dessus du prompt l'étape active, le chemin parcouru
et ce que Claude est en train de faire.

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](.claude-plugin/plugin.json)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-D97757)](#prérequis)
[![Dépendances](https://img.shields.io/badge/d%C3%A9pendances-aucune-brightgreen)](#confidentialité)
[![Licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

</div>

```text
◆ Migrer l'authentification · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Écriture des tests
```

## Sommaire

- [Pourquoi michi](#pourquoi-michi)
- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Utilisation](#utilisation)
- [Confidentialité](#confidentialité)
- [Compatibilité](#compatibilité)
- [FAQ](#faq)
- [Documentation](#documentation)
- [Contribuer](#contribuer)
- [Licence](#licence)

## Pourquoi michi

Quand Claude mène un travail en plusieurs étapes, son plan apparaît dans la conversation, puis
défile avec elle. Savoir où il en est demande de remonter le fil, ou de lui poser la question.

michi garde la réponse sous vos yeux, sur une seule ligne au-dessus du prompt : le plan, l'étape
en cours, la progression et l'activité du moment.

- **Sans configuration.** Le mod suit les outils de tâches de Claude Code, les plans validés en mode
  plan et les plans [Superpowers](https://github.com/obra/superpowers). Rien à saisir.
- **Discret.** Rien ne s'affiche tant qu'il n'y a pas de plan. La ligne s'adapte à la largeur
  disponible et laisse visible ce que dessinent les autres mods.
- **Sobre.** Aucune dépendance, aucun fichier écrit, aucun appel réseau.

## Fonctionnalités

| Fonctionnalité            | Ce qu'elle apporte                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Bande au-dessus du prompt | Titre du plan, numéro d'étape, barre de progression et activité du moment, sur une ligne.              |
| Panneau `/michi`          | La liste complète des étapes, à jour en continu. La commande répond même pendant que Claude travaille. |
| Outils de tâches          | `TodoWrite`, `TaskCreate` et `TaskUpdate` alimentent la jauge, sans rien changer à leur comportement.  |
| Mode plan                 | Après validation d'un plan, Claude déclare ses étapes au mod et les tient à jour.                      |
| Plans Superpowers         | La jauge suit le document du plan et l'avancement consigné dans son registre.                          |
| Fiabilité                 | Seuls comptent les appels aboutis de la session principale : les subagents ne brouillent pas la vue.   |

## Démarrage rapide

### Prérequis

Claude Code **2.1.287 ou plus récent** :

```bash
claude --version
```

L'app desktop embarque sa propre copie de Claude Code ; sa version se lit avec `/status`.

### Installation

Le dépôt est sa propre marketplace, nommée `michi-local`.

```bash
git clone https://github.com/oliver254/michi.git
```

```bash
claude plugin marketplace add ./michi
```

```bash
claude plugin install michi@michi-local
```

Dans une session déjà ouverte, `/reload-plugins` charge le mod. La marketplace pointe sur le dossier
cloné : s'il est déplacé ou supprimé, le mod ne se charge plus.

### Essayer sans installer

Le temps d'une session, depuis le dossier parent du dépôt :

```bash
claude --plugin-dir ./michi
```

Le module est rechargé à chaque sauvegarde, ce qui en fait aussi le mode de développement.

### App desktop

Un mod installé depuis le terminal au niveau utilisateur se charge aussi dans l'onglet Code. Sans
passer par le terminal, indiquer le chemin absolu du dépôt dans `~/.claude/settings.json` :

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\chemin\\vers\\michi"
  }
}
```

### Désinstaller

```bash
claude plugin uninstall michi@michi-local
```

```bash
claude plugin marketplace remove michi-local
```

## Utilisation

### Lire la bande

```text
◆ Migrer l'authentification · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Écriture des tests
  └───────── titre ───────┘   └ étape ┘   └barre┘   └──── activité ────┘
```

| Élément  | Signification                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Titre    | Titre du plan validé ou du document Superpowers. `Plan` à défaut.                                                     |
| Étape    | Étapes terminées **plus** étapes en cours, sur le total : c'est le nombre de cases pleines.                           |
| Barre    | Une case par étape : terminée, en cours (jaune), à faire (`▱`). Au-delà de 10 étapes, la barre est ramenée à 10 cases. |
| Activité | `▶` l'étape en cours · `○` la prochaine, quand rien n'est en cours · `✔ terminé` à la fin du plan.                     |

Quand plusieurs étapes sont menées en parallèle, la bande montre la première et compte les autres :
`▶ Écriture des tests (+1)`. Sur une bande étroite, le libellé est coupé (`…`) ; si la place manque
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

### D'où vient le plan

Le mod reconnaît trois sources, sans réglage :

| Source                                                     | Ce qui fait avancer la jauge                                                          | Titre                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| Outils de tâches (`TodoWrite`, `TaskCreate`, `TaskUpdate`) | Chaque appel abouti de la session principale.                                         | Celui du plan validé, ou `Plan` |
| Mode plan, dans une session sans outil de tâches           | Claude déclare les étapes avec l'outil du mod, `mcp__michi__steps`, puis les met à jour. | Première ligne du plan validé  |
| Plan [Superpowers](https://github.com/obra/superpowers)     | Le document `docs/superpowers/plans/<nom>.md` et son registre d'avancement.           | Titre du document              |

Après la validation d'un plan en mode plan, la bande apparaît au premier appel de l'outil d'étapes,
donc quelques instants plus tard. Un plan Superpowers est suivi dès que la session lit, écrit ou
modifie son document (une simple lecture ne le substitue pas aux étapes en cours de la session) :

```text
◆ T3 — Favoris, filtres, fraîcheur · étape 21/50 · ▰▰▰▰▰▱▱▱▱▱ · ▶ F4 — Le filtre appliqué
```

Le détail de chaque source, des priorités entre elles et de la durée de vie du plan est dans
[docs/fonctionnement.md](docs/fonctionnement.md).

## Confidentialité

| Le mod…                 | Concrètement                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Lit                     | Uniquement le document du plan Superpowers ouvert par la session, et son registre. Sans plan Superpowers, rien.   |
| Consulte                | La liste des outils de la session, au démarrage et à chaque plan validé, pour savoir si elle a un outil de tâches. |
| Garde                   | Le plan, dans une seule clé de l'état de session (`michi.plan`). Rien n'est écrit sur disque.                     |
| Ajoute à ce que Claude lit | Dans une session sans outil de tâches : la description de `mcp__michi__steps`, et une consigne de trois phrases après chaque plan validé. |
| Ne fait jamais          | Écrire un fichier, lancer un processus, appeler le réseau, interroger un modèle, modifier les arguments ou le résultat d'un outil. |

Tout cela se vérifie sans lancer le mod : les lignes `hooks:` et `calls:` de la commande suivante
listent tout ce qu'il écoute et tout ce qu'il appelle.

```bash
claude plugin validate .
```

## Compatibilité

| Surface                                 | Suivi du plan | Bande et panneau |
| --------------------------------------- | :-----------: | :--------------: |
| Terminal                                | ✔             | ✔                |
| App desktop (onglet Code)               | ✔             | ✔                |
| Extension VS Code, `claude -p`, SDK     | ✔             | —                |

**Statut :** version 0.3.0, validée par ses tests automatisés avec Claude Code 2.1.296. Le rendu n'a
pas encore été contrôlé visuellement dans une session réelle. Voir les
[limites connues](docs/limites.md).

## FAQ

<details>
<summary><b>La bande n'apparaît pas.</b></summary>

Elle ne s'affiche qu'à partir de la première étape : un plan validé ne montre rien tant que Claude
n'a pas déclaré ses étapes. S'il ne le fait pas, lui demander « déclare les étapes du plan avec
`mcp__michi__steps` ». La bande peut aussi être repliée (`Ctrl+X` puis `Ctrl+A`), ou cédée à une
enquête de Claude Code.

</details>

<details>
<summary><b>Claude n'a pas l'outil <code>mcp__michi__steps</code>.</b></summary>

Le mod le déclare au démarrage de la session : une session ouverte avant l'installation ou la mise à
jour du mod ne l'a pas. `/reload-plugins`, ou une nouvelle session, le fait apparaître. Il est aussi
absent, volontairement, d'une session qui a déjà `TaskCreate` ou `TodoWrite`.

</details>

<details>
<summary><b>Le mod ne se charge pas.</b></summary>

Vérifier la version (`claude --version`), puis la liste des mods actifs dans `/plugin`.
`claude --debug` écrit dans le journal la raison d'un chargement refusé.

</details>

<details>
<summary><b>Le plan a disparu.</b></summary>

C'est attendu après `/clear`, `/resume` ou `/branch`, et à la fin de la session. Le plan survit en
revanche au rechargement du mod et à la compaction de la conversation.

</details>

<details>
<summary><b>La bande ne suit pas le plan.</b></summary>

Un hook de diagnostic, à ajouter temporairement, écrit dans le transcript chaque appel d'outil de plan
avec ses arguments et son résultat. Il est décrit dans
[docs/developpement.md](docs/developpement.md#diagnostiquer-le-suivi).

</details>

## Documentation

| Page                                             | Contenu                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [Fonctionnement](docs/fonctionnement.md)         | Outils écoutés, outil d'étapes, plans Superpowers, passage d'un plan à l'autre, durée de vie. |
| [Développement](docs/developpement.md)           | Arborescence, validation, tests, conventions, diagnostic.                                |
| [Limites connues](docs/limites.md)               | Ce que le mod ne fait pas encore, ou pas partout.                                        |

## Contribuer

Avant de proposer une modification, valider le mod et lancer les tests ; les deux tournent sans
session ni réseau :

```bash
claude plugin validate . --strict
```

```bash
claude plugin test .
```

Le code n'a aucune dépendance externe. Identifiants en anglais ; commentaires, intitulés de tests et
textes affichés en français. Tout ce qui se calcule sans le moteur vit dans `hooks/plan.ts`. Le reste
est dans [docs/developpement.md](docs/developpement.md).

## Licence

Distribué sous licence [MIT](LICENSE).
