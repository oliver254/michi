# michi

Mod Claude Code qui affiche en permanence, au-dessus du prompt, l'avancement du plan en cours.

```text
◆ Migrer l'authentification · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Écriture des tests
```

## Ce que fait le mod

- **Bande au-dessus du prompt**, sur une ligne : titre du plan, étape, barre, activité.
  - `étape 3/7` compte les étapes faites et en cours : c'est le nombre de cases pleines.
  - `▶` forme active de l'étape en cours, `○` prochaine étape quand rien n'est en cours, `✔ terminé` à la fin.
  - Le libellé est coupé à la largeur de la bande ; sur une bande étroite, la barre puis le titre s'effacent.
  - Sans plan, rien n'est affiché. Ce que dessinent les autres mods reste visible sous la ligne.
- **Commande `/michi`** : ouvre un panneau avec la liste complète (`✔` terminée, `▶` en cours, `○` à faire).
  Elle répond tout de suite, même pendant que Claude travaille.
- **Capture du plan** : `TodoWrite`, `TaskCreate`, `TaskUpdate`, et `ExitPlanMode` pour le titre du plan validé.
  Seuls comptent les appels de la session principale qui ont abouti (ni refusés, ni en erreur) ;
  ceux des subagents sont ignorés.
- **État** : gardé dans `$.state`, il survit aux rechargements du module et repart de zéro
  sur `/clear`, `/resume` et `/branch`.

## Prérequis

Claude Code 2.1.287 ou plus récent (`claude --version`). Dans l'app desktop, les mods fonctionnent
dans l'onglet Code, qui embarque sa propre copie de Claude Code.

## Charger le mod pour une session

Depuis le dossier parent du dépôt :

```bash
claude --plugin-dir ./michi
```

Depuis le dépôt lui-même, c'est `claude --plugin-dir .`. Le module est rechargé à chaque sauvegarde.
Pour l'app desktop, qui ne prend pas de drapeau, donner le chemin absolu du dépôt dans
`CLAUDE_CODE_PLUGIN_DIRS` (bloc `env` de `~/.claude/settings.json`).

## Installer via une marketplace locale

Le dépôt est sa propre marketplace (`.claude-plugin/marketplace.json`, nommée `michi-local`).
Depuis le dossier parent :

```bash
claude plugin marketplace add ./michi
```

```bash
claude plugin install michi@michi-local
```

Dans une session déjà ouverte, `/reload-plugins` charge le mod. La marketplace pointe sur ce dossier :
le mod cesse de se charger si le dossier est déplacé ou supprimé.

## Développer

```bash
claude plugin validate . --strict
```

```bash
claude plugin test .
```

- `hooks/register.ts` : les hooks (capture, bande, commande, panneau).
- `hooks/plan.ts` : la logique pure (transitions du plan, largeur, mise en forme).
- `types/index.d.ts` : le contrat de `$.state`.
- `tests/` : la logique seule (`plan.test.ts`) et le mod à travers le moteur (`michi.test.ts`).

## Diagnostic

Si la bande ne suit pas le plan, ce hook temporaire, ajouté dans `register`, écrit dans le transcript
chaque appel d'outil de plan avec ses arguments et son résultat. À retirer ensuite.

```ts
on('tool.call', { tool: /^(TodoWrite|Task|ExitPlanMode)/ }, async ($, e, next) => {
  const ran = await next(e)

  $.ui.log(`${e.tool} ${JSON.stringify(e)} -> ${JSON.stringify(ran)}`)

  return ran
})
```
