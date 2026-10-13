import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TextProps } from 'claude-code'

import type { Status } from '../types'
import {
  EMPTY_PLAN,
  GLYPHS,
  addTask,
  applyLedger,
  approvePlan,
  composeBand,
  composeHeader,
  composeList,
  extractTitle,
  isPlanDocument,
  locateLedger,
  parseLedger,
  parsePlanDocument,
  replaceTasks,
  trackDocument,
  truncate,
  updateTask,
} from './plan'
import type { Tone } from './plan'

/** Identifiant du panneau que la commande /michi ouvre. */
const PANE_ID = 'michi'

// Le plan vit dans `$.state` : il survit ainsi aux rechargements du module, ce qu'une variable ne fait pas.
// `plugin` et `key` restent des littéraux : `claude plugin validate` les lit dans le source.
const plan = atom({ plugin: 'michi', key: 'plan' } as const, EMPTY_PLAN)

/** Style de chaque morceau de la bande : uniquement des props que `Text` accepte. */
const BAND_STYLES: Record<Tone, TextProps> = {
  title: { bold: true },
  muted: { dimColor: true },
  done: { color: 'success' },
  active: { color: 'yellow', bold: true },
}

/** Style d'une ligne du panneau selon le statut de l'étape. */
const STEP_STYLES: Record<Status, TextProps> = {
  completed: { dimColor: true },
  in_progress: { color: 'yellow', bold: true },
  pending: {},
}

/** Lit un fichier ; `null` s'il manque ou ne peut pas être lu. */
async function readFile($: EngineInterface, path: string | null): Promise<string | null> {
  if (path === null) {
    return null
  }

  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

/** Prend pour jauge le plan Superpowers dont la session vient de toucher le document. */
async function track($: EngineInterface, path: string): Promise<void> {
  const document = parsePlanDocument(await readFile($, path))

  if (document === null) {
    return
  }

  const ledger = parseLedger(await readFile($, locateLedger(path)))

  await update($, plan, current => trackDocument(current, path, document, ledger))
}

/** Relit le registre du plan Superpowers suivi, s'il y en a un, et n'écrit l'état que s'il a bougé. */
async function refresh($: EngineInterface): Promise<void> {
  const current = await read($, plan)

  if (current.document === null) {
    return
  }

  const ledger = parseLedger(await readFile($, locateLedger(current.document.path)))

  if (ledger !== null && applyLedger(current, ledger) !== current) {
    await update($, plan, latest => applyLedger(latest, ledger))
  }
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
    await update($, plan, () => EMPTY_PLAN)

    return next(e)
  })

  // --- Capture du plan ---------------------------------------------------
  // Chaque hook laisse d'abord l'outil s'exécuter (`await next(e)`), puis ne retient le changement
  // que si l'appel vient de la session principale (pas d'`agentId`) et n'a été ni refusé ni en échec.

  // TodoWrite : la liste entière des tâches, à chaque appel.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      await update($, plan, current => replaceTasks(current, e.todos))
    }

    return ran
  })

  // TaskCreate : une tâche de plus ; son identifiant n'est connu que dans le résultat.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      const id = ran.result?.task?.id

      if (typeof id === 'string') {
        await update($, plan, current =>
          addTask(current, { id, subject: e.subject, activeForm: e.activeForm }),
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
      await update($, plan, current =>
        updateTask(current, {
          id: e.taskId,
          status: e.status,
          subject: e.subject,
          activeForm: e.activeForm,
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
      const title = extractTitle(ran.result?.plan)

      await update($, plan, current => approvePlan(current, title))
    }

    return ran
  })

  // --- Plans Superpowers -------------------------------------------------
  // Un plan Superpowers ne passe pas par le mode plan : c'est un document, et son avancement
  // s'écrit dans un registre. Quand la session lit, écrit ou modifie ce document, sa jauge devient
  // celle de ce plan. Ensuite, toute commande ou modification de fichier de la session a pu faire
  // avancer le registre : on le relit. Les appels des subagents (exécutants, relecteurs) ne comptent pas.
  on('tool.call', { tool: ['Read', 'Write', 'Edit', 'Bash'] }, async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) {
      return ran
    }

    if (e.tool !== 'Bash' && isPlanDocument(e.file_path)) {
      await track($, e.file_path)
    } else if (e.tool !== 'Read') {
      await refresh($)
    }

    return ran
  })

  // --- Affichage ---------------------------------------------------------

  // La bande, sur une ligne. Lire le plan ici abonne le dessin : chaque écriture le redessine.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const segments = composeBand(await read($, plan), e.props.bodyColumns)

    // Pas de plan, ou une enquête occupe la bande : on laisse la place aux autres mods et au moteur.
    if (segments === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return Box({
      flexDirection: 'column',
      children: [
        // `composeBand` a déjà coupé le libellé à la largeur ; `wrap` n'est qu'un filet de sécurité.
        Text({
          wrap: 'truncate-end',
          children: segments.map(segment =>
            Text({ ...BAND_STYLES[segment.tone], children: segment.text }),
          ),
        }),
        // Ce que dessinent les mods suivants (et le moteur) reste affiché sous notre ligne.
        await next(e),
      ],
    })
  })

  // /michi : ouvre le panneau. Là où aucune surface n'en place, la liste part en texte.
  on('command.run', { command: 'michi' }, async $ => {
    const opened = await $.ui.open({ id: PANE_ID, title: 'Plan' })

    return opened.isPlaced ? {} : { text: composeList(await read($, plan)) }
  })

  // Le panneau : la liste complète, une ligne par étape.
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, plan)
    const columns = e.props.bodyColumns

    if (current.steps.length === 0) {
      return Box({
        flexDirection: 'column',
        children: Text({ dimColor: true, children: 'Aucun plan en cours.' }),
      })
    }

    return Box({
      flexDirection: 'column',
      children: [
        Text({ bold: true, wrap: 'truncate-end', children: truncate(composeHeader(current), columns) }),
        ...current.steps.map(step =>
          Text({
            ...STEP_STYLES[step.status],
            wrap: 'truncate-end',
            children: truncate(`${GLYPHS[step.status]} ${step.subject}`, columns),
          }),
        ),
      ],
    })
  })
}
