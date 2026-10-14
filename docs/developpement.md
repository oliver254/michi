# Développement

[← Retour au README](../README.md)

- [Arborescence](#arborescence)
- [Architecture](#architecture)
- [Valider et tester](#valider-et-tester)
- [Conventions](#conventions)
- [Publier une version](#publier-une-version)
- [Diagnostiquer le suivi](#diagnostiquer-le-suivi)

## Arborescence

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
├── tests/
│   ├── plan.test.ts        la logique seule
│   └── michi.test.ts       le mod à travers le moteur de test
├── docs/                   documentation détaillée
├── LICENSE
└── README.md
```

`.claude-plugin/types/` est ignoré par Git : Claude Code y pose, à chaque chargement, les types
propres à la version installée.

## Architecture

```text
appel d'outil ──► register.ts ──► plan.ts ──► $.state (michi.plan) ──► register.ts ──► bande / panneau
               (filtre : session     (transition                        (rendu AbovePrompt
                principale, appel     pure)                              et Pane)
                abouti)
```

- **`hooks/register.ts`** branche le mod sur le moteur : il écoute les appels d'outils, déclare la
  commande `/michi` et l'outil `mcp__michi__steps`, et dessine la bande et le panneau.
- **`hooks/plan.ts`** contient tout ce qui se calcule sans le moteur : transitions du plan, lecture
  des documents et registres Superpowers, largeur des caractères, composition des lignes. C'est la
  partie la plus testée.
- **`types/index.d.ts`** décrit le seul état conservé, `michi.plan`. `claude plugin validate` vérifie
  chaque clé `$.state` nommée par le module contre ce fichier.

## Valider et tester

Valider le manifeste et le module, avertissements compris :

```bash
claude plugin validate . --strict
```

Lancer les tests, sans session ni réseau :

```bash
claude plugin test .
```

Essayer le mod dans une vraie session, rechargé à chaque sauvegarde :

```bash
claude --plugin-dir .
```

Les tests couvrent la création du plan, le passage d'une tâche en cours puis terminée, la fin du
plan, l'absence de plan, le rendu de la bande et du panneau sur `terminal` et `desktop`, les appels
refusés ou en erreur, les subagents, la troncature, la remise à zéro, le suivi d'un plan
Superpowers (document, registre, cases cochées, lecture pendant un plan de session) et l'outil
d'étapes (déclaration, consigne à la validation du plan, liste mal formée ou vide, forme active
nulle, réponse pendant un aperçu, plan terminé prolongé, plan validé par-dessus un plan en cours,
session qui a déjà un outil de tâches).

Pour vérifier que l'outil d'étapes est bien déclaré, le message `init` de la sortie suivante, émis
avant tout appel au modèle, liste les outils et les plugins chargés :

```bash
claude -p "bonjour" --output-format stream-json --verbose --max-turns 1 --plugin-dir . --debug
```

## Conventions

- **Aucune dépendance externe.**
- **Langue** : identifiants en anglais ; commentaires, intitulés de tests et textes affichés en
  français.
- **Séparation** : tout ce qui se calcule sans le moteur vit dans `hooks/plan.ts`, et se teste dans
  `tests/plan.test.ts`. `tests/michi.test.ts` couvre le mod à travers le moteur de test.
- **Commits** : préfixes `feat:`, `docs:`… suivis d'un résumé en français.

## Publier une version

La version vit dans `.claude-plugin/plugin.json`. Le badge du README la reprend : les deux changent
ensemble, avec la mention de version de la section [Compatibilité](../README.md#compatibilité) et
des [limites connues](limites.md).

## Diagnostiquer le suivi

Quand la bande ne suit pas le plan, ajouter temporairement ce hook dans `register` : il écrit dans le
transcript chaque appel d'outil de plan, avec ses arguments et son résultat. À retirer ensuite.

```ts
on('tool.call', { tool: /^(TodoWrite|Task|ExitPlanMode|mcp__michi__)/ }, async ($, e, next) => {
  const ran = await next(e)

  $.ui.log(`${e.tool} ${JSON.stringify(e)} -> ${JSON.stringify(ran)}`)

  return ran
})
```

Si le mod ne se charge pas du tout, `claude --debug` écrit dans le journal la raison du refus.
