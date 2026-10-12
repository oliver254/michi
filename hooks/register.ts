import { atom, read, update } from 'claude-code'
import type { Register, TextProps } from 'claude-code'

import type { Statut } from '../types'
import {
  GLYPHES,
  PLAN_VIDE,
  ajouterTache,
  composerBande,
  composerEnTete,
  composerListe,
  extraireTitre,
  modifierTache,
  remplacerTaches,
  tronquer,
  validerPlan,
} from './plan'
import type { Ton } from './plan'

/** Identifiant du panneau que la commande /michi ouvre. */
const PANNEAU = 'michi'

// Le plan vit dans `$.state` : il survit ainsi aux rechargements du module, ce qu'une variable ne fait pas.
// `plugin` et `key` restent des littéraux : `claude plugin validate` les lit dans le source.
const plan = atom({ plugin: 'michi', key: 'plan' } as const, PLAN_VIDE)

/** Style de chaque morceau de la bande : uniquement des props que `Text` accepte. */
const STYLES_BANDE: Record<Ton, TextProps> = {
  titre: { bold: true },
  discret: { dimColor: true },
  fait: { color: 'success' },
  actif: { color: 'yellow', bold: true },
}

/** Style d'une ligne du panneau selon le statut de l'étape. */
const STYLES_ETAPE: Record<Statut, TextProps> = {
  completed: { dimColor: true },
  in_progress: { color: 'yellow', bold: true },
  pending: {},
}

export const register: Register = on => {
  // `session.start` est rejoué à chaque rechargement du module : on y déclare la commande,
  // sans toucher à l'état, qui doit justement survivre au rechargement.
  on('session.start', async ($, e, next) => {
    // Le nom est écrit en littéral, ici et au hook `command.run` : `claude plugin validate`
    // reconnaît ainsi que le mod répond à sa propre commande.
    await $.command.register({
      name: 'michi',
      description: 'Affiche le plan en cours et ses étapes dans un panneau',
      // S'exécute tout de suite, même pendant que Claude travaille.
      immediate: true,
    })

    return next(e)
  })

  // /clear, /resume et /branch (que le moteur annonce comme « fork ») ouvrent une autre conversation :
  // le plan affiché n'est plus le sien. `$.state` y est déjà remis à zéro par le moteur ; on l'écrit
  // quand même, pour ne pas dépendre de ce détail.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await update($, plan, () => PLAN_VIDE)

    return next(e)
  })

  // --- Capture du plan ---------------------------------------------------
  // Chaque hook laisse d'abord l'outil s'exécuter (`await next(e)`), puis ne retient le changement
  // que si l'appel vient de la session principale (pas d'`agentId`) et n'a été ni refusé ni en échec.

  // TodoWrite : la liste entière des tâches, à chaque appel.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      await update($, plan, courant => remplacerTaches(courant, e.todos))
    }

    return ran
  })

  // TaskCreate : une tâche de plus ; son identifiant n'est connu que dans le résultat.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      const id = ran.result?.task?.id

      if (typeof id === 'string') {
        await update($, plan, courant =>
          ajouterTache(courant, { id, sujet: e.subject, formeActive: e.activeForm }),
        )
      }
    }

    return ran
  })

  // TaskUpdate : statut, intitulé ou forme active d'une tâche. L'outil peut répondre sans erreur
  // tout en signalant `success: false` (tâche inconnue) : rien n'a alors changé.
  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)

    if (
      e.agentId === undefined &&
      ran.deny === undefined &&
      ran.isError !== true &&
      ran.result?.success !== false
    ) {
      await update($, plan, courant =>
        modifierTache(courant, {
          id: e.taskId,
          statut: e.status,
          sujet: e.subject,
          formeActive: e.activeForm,
        }),
      )
    }

    return ran
  })

  // ExitPlanMode : le plan validé n'est pas dans les arguments de l'outil mais dans son résultat.
  // Un refus de l'utilisateur revient en erreur, donc sans effet ici.
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      const titre = extraireTitre(ran.result?.plan)

      await update($, plan, courant => validerPlan(courant, titre))
    }

    return ran
  })

  // --- Affichage ---------------------------------------------------------

  // La bande, sur une ligne. Lire le plan ici abonne le dessin : chaque écriture le redessine.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const segments = composerBande(await read($, plan), e.props.bodyColumns)

    // Pas de plan, ou une enquête occupe la bande : on laisse la place aux autres mods et au moteur.
    if (segments === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return Box({
      flexDirection: 'column',
      children: [
        // `composerBande` a déjà coupé le libellé à la largeur ; `wrap` n'est qu'un filet de sécurité.
        Text({
          wrap: 'truncate-end',
          children: segments.map(segment =>
            Text({ ...STYLES_BANDE[segment.ton], children: segment.texte }),
          ),
        }),
        // Ce que dessinent les mods suivants (et le moteur) reste affiché sous notre ligne.
        await next(e),
      ],
    })
  })

  // /michi : ouvre le panneau. Là où aucune surface n'en place, la liste part en texte.
  on('command.run', { command: 'michi' }, async $ => {
    const ouverture = await $.ui.open({ id: PANNEAU, title: 'Plan' })

    return ouverture.isPlaced ? {} : { text: composerListe(await read($, plan)) }
  })

  // Le panneau : la liste complète, une ligne par étape.
  on('ui.render', { component: 'Pane', requestId: PANNEAU }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const courant = await read($, plan)
    const colonnes = e.props.bodyColumns

    if (courant.etapes.length === 0) {
      return Box({
        flexDirection: 'column',
        children: Text({ dimColor: true, children: 'Aucun plan en cours.' }),
      })
    }

    return Box({
      flexDirection: 'column',
      children: [
        Text({ bold: true, wrap: 'truncate-end', children: tronquer(composerEnTete(courant), colonnes) }),
        ...courant.etapes.map(etape =>
          Text({
            ...STYLES_ETAPE[etape.statut],
            wrap: 'truncate-end',
            children: tronquer(`${GLYPHES[etape.statut]} ${etape.sujet}`, colonnes),
          }),
        ),
      ],
    })
  })
}
