import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

import { largeur } from '../hooks/plan'

// Tests du mod à travers le moteur : on déclenche les événements comme Claude Code le ferait,
// et on lit ce que les hooks ont dessiné. Aucune session, aucun outil réel.

/** Ce que le « moteur » du test dessine dans la bande quand le mod lui passe la main. */
const DESSIN_MOTEUR = 'dessin du moteur'

/** Le plan d'exemple : intitulé et forme active de chaque tâche. */
const TACHES = [
  ['Écrire le parseur', 'Écriture du parseur'],
  ['Brancher la CLI', 'Branchement de la CLI'],
  ['Documenter', 'Rédaction de la documentation'],
] as const

/** Ce que Claude Code passe à un hook `ui.render` pour la bande, hors surface. */
const BANDE = {
  plugin: 'michi',
  component: 'AbovePrompt',
  viewport: { columns: 100, rows: 30 },
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 8,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 7 },
    view: {},
  },
} as const

/** Idem pour le panneau ouvert par /michi. */
const PANNEAU = {
  plugin: 'michi',
  component: 'Pane',
  requestId: 'michi',
  viewport: { columns: 140, rows: 40 },
  props: {
    title: 'Plan',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/**
 * Répond à la place de Claude Code : résultats d'outils, dessin de la bande, commandes, panneaux.
 * Renvoie de quoi régler ces réponses et relire ce que le mod a demandé.
 * À appeler avant le premier appel sur `$` : le kit refuse un `on` tardif.
 */
function simulerMoteur(on: On) {
  const moteur = {
    /** Les prochains appels d'outil sont refusés. */
    refuse: false,
    /** Les prochains appels d'outil échouent. */
    echoue: false,
    /** TaskUpdate répond « tâche inconnue », sans erreur. */
    tacheInconnue: false,
    /** Le texte du plan qu'ExitPlanMode renvoie une fois accepté. */
    planValide: "# Migrer l'authentification\n\n1. Écrire le parseur\n2. Brancher la CLI" as string | null,
    /** `$.ui.open` place le panneau. */
    placePanneau: true,
    /** Les commandes que le mod a déclarées. */
    commandes: [] as unknown[],
    /** Les panneaux que le mod a ouverts. */
    panneaux: [] as unknown[],
  }
  let dernierId = 0

  on('tool.call', (_$, e) => {
    if (moteur.refuse) {
      return { deny: 'refusé par le test' }
    }

    if (moteur.echoue) {
      return { isError: true, result: 'échec simulé', text: 'échec simulé' }
    }

    // Les résultats ont la forme que les types de cette version donnent à chaque outil.
    if (e.tool === 'TodoWrite') {
      return { result: { oldTodos: [], newTodos: e.todos } }
    }

    if (e.tool === 'TaskCreate') {
      dernierId += 1

      return { result: { task: { id: String(dernierId), subject: e.subject } } }
    }

    if (e.tool === 'TaskUpdate') {
      return moteur.tacheInconnue
        ? { result: { success: false, taskId: e.taskId, updatedFields: [], error: 'Task not found' } }
        : { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
    }

    if (e.tool === 'ExitPlanMode') {
      return { result: { plan: moteur.planValide, isAgent: false } }
    }

    return { result: 'ok' }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: [DESSIN_MOTEUR] }))
  on('session.start', () => ({ cwd: '/travail' }))
  on('classic.SessionStart', () => ({}))
  on('command.register', (_$, e) => {
    moteur.commandes.push(e)

    return { value: { command: e.name } }
  })
  on('ui.open', (_$, e) => {
    moteur.panneaux.push(e)

    return {
      value: moteur.placePanneau
        ? { isPlaced: true }
        : { isPlaced: false, reason: 'aucune surface ne place de panneau' },
    }
  })

  return moteur
}

/** Crée le plan d'exemple, une tâche par appel à TaskCreate (identifiants « 1 », « 2 », « 3 »). */
async function creerPlan($: Engine) {
  for (const [subject, activeForm] of TACHES) {
    await $.tool.call({ tool: 'TaskCreate', subject, description: subject, activeForm })
  }
}

/** Change le statut d'une tâche, comme Claude le ferait avec TaskUpdate. */
function passer($: Engine, taskId: string, status: 'in_progress' | 'completed') {
  return $.tool.call({ tool: 'TaskUpdate', taskId, status })
}

/** Tape /michi au prompt d'un terminal plein écran. */
function lancerMichi($: Engine) {
  return $.command.run({
    command: 'michi',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 140 },
  })
}

/** Dessine la bande sur le terminal et renvoie la ligne du mod (`undefined` s'il n'a rien dessiné). */
async function lireBande($: Engine, props: Partial<RenderPropsOf['AbovePrompt']> = {}) {
  const ui = await $.ui.mount({ ...BANDE, surface: 'terminal', props: { ...BANDE.props, ...props } })
  const ligne = await ui.find({ type: 'Text', text: '◆' })
  const moteur = await ui.find({ type: 'Text', text: DESSIN_MOTEUR })

  await ui.unmount()

  return { ligne: ligne?.text, aDessinMoteur: moteur !== undefined }
}

// --- Capture du plan et bande --------------------------------------------

test('sans plan, la bande est laissée au moteur', async ($, on) => {
  simulerMoteur(on)

  expect(await lireBande($)).toEqual({ ligne: undefined, aDessinMoteur: true })
})

test('plan créé : la bande annonce la première étape à venir', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)

  expect((await lireBande($)).ligne).toBe('◆ Plan · étape 0/3 · ▱▱▱ · ○ Écrire le parseur')
})

test('tâche passée en cours : la bande montre sa forme active', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)
  await passer($, '1', 'in_progress')

  expect((await lireBande($)).ligne).toBe('◆ Plan · étape 1/3 · ▰▱▱ · ▶ Écriture du parseur')
})

test('tâche terminée : la case reste pleine et la suivante est annoncée', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)
  await passer($, '1', 'in_progress')
  await passer($, '1', 'completed')

  expect((await lireBande($)).ligne).toBe('◆ Plan · étape 1/3 · ▰▱▱ · ○ Brancher la CLI')
})

test('plan terminé : toutes les cases sont pleines', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)

  for (const id of ['1', '2', '3']) {
    await passer($, id, 'completed')
  }

  expect((await lireBande($)).ligne).toBe('◆ Plan · étape 3/3 · ▰▰▰ · ✔ terminé')
})

test('la bande déjà affichée suit le plan sans être redemandée', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDE, surface })
    const avant = (await ui.find({ type: 'Text', text: '◆' }))?.text

    // L'écriture dans `$.state` suffit à redessiner : le test ne remonte rien.
    await passer($, '2', 'in_progress')
    const actif = await ui.find({ type: 'Text', text: /^▶ / })

    expect(avant).toContain('○ ')
    expect(actif?.text).toBe('▶ Branchement de la CLI')
    expect(actif?.props).toEqual({ color: 'yellow', bold: true })

    await passer($, '2', 'completed')
    await ui.unmount()
  }
})

test('ExitPlanMode accepté donne son titre au plan', async ($, on) => {
  simulerMoteur(on)
  await $.tool.call({ tool: 'ExitPlanMode' })
  await creerPlan($)

  expect((await lireBande($)).ligne).toBe(
    "◆ Migrer l'authentification · étape 0/3 · ▱▱▱ · ○ Écrire le parseur",
  )
})

test('ExitPlanMode refusé par l’utilisateur ne change pas le titre', async ($, on) => {
  const moteur = simulerMoteur(on)

  moteur.echoue = true
  await $.tool.call({ tool: 'ExitPlanMode' })
  moteur.echoue = false
  await creerPlan($)

  expect((await lireBande($)).ligne).toStartWith('◆ Plan · ')
})

test('TodoWrite remplace la liste à chaque appel', async ($, on) => {
  simulerMoteur(on)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Lire le code', status: 'completed', activeForm: 'Lecture du code' },
      { content: 'Corriger le bug', status: 'in_progress', activeForm: 'Correction du bug' },
      { content: 'Tester', status: 'pending', activeForm: 'Exécution des tests' },
      { content: 'Livrer', status: 'pending', activeForm: 'Livraison' },
    ],
  })

  expect((await lireBande($)).ligne).toBe('◆ Plan · étape 2/4 · ▰▰▱▱ · ▶ Correction du bug')
})

test('un appel refusé ou en échec ne change pas le plan', async ($, on) => {
  const moteur = simulerMoteur(on)

  await creerPlan($)
  const attendu = '◆ Plan · étape 0/3 · ▱▱▱ · ○ Écrire le parseur'

  moteur.refuse = true
  await passer($, '1', 'in_progress')
  await $.tool.call({ tool: 'TaskCreate', subject: 'En trop', description: 'En trop' })
  expect((await lireBande($)).ligne).toBe(attendu)

  moteur.refuse = false
  moteur.echoue = true
  await passer($, '1', 'in_progress')
  await $.tool.call({ tool: 'TodoWrite', todos: [] })
  expect((await lireBande($)).ligne).toBe(attendu)

  moteur.echoue = false
  moteur.tacheInconnue = true
  await passer($, '1', 'completed')
  expect((await lireBande($)).ligne).toBe(attendu)
})

test('les appels venant d’un subagent sont ignorés', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)

  // Le type de `$.tool.call` ne déclare pas `agentId`, mais le kit le transmet aux hooks
  // comme le fait la boucle d'un subagent : d'où le `as never`.
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed', agentId: 'agent-7' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Du subagent', description: 'x', agentId: 'agent-7' } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [], agentId: 'agent-7' } as never)
  await $.tool.call({ tool: 'ExitPlanMode', agentId: 'agent-7' } as never)

  expect((await lireBande($)).ligne).toBe('◆ Plan · étape 0/3 · ▱▱▱ · ○ Écrire le parseur')
})

test('le libellé est coupé à la largeur de la bande', async ($, on) => {
  simulerMoteur(on)
  await $.tool.call({
    tool: 'TaskCreate',
    subject: 'Refondre',
    description: 'Refondre',
    activeForm: 'Refonte complète du module de facturation et de tous ses rapports mensuels',
  })
  await passer($, '1', 'in_progress')

  const { ligne = '' } = await lireBande($, { bodyColumns: 48 })

  expect(largeur(ligne)).toBeLessThanOrEqual(48)
  expect(ligne).toStartWith('◆ Plan · étape 1/1 · ▰ · ▶ Refonte')
  expect(ligne).toEndWith('…')
})

test('ce que dessinent les autres mods reste affiché sous la ligne du mod', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)

  const { ligne, aDessinMoteur } = await lireBande($)

  expect(ligne).toBeDefined()
  expect(aDessinMoteur).toBe(true)
})

test('une enquête garde la bande pour elle', async ($, on) => {
  simulerMoteur(on)
  await creerPlan($)

  expect(await lireBande($, { hasSurvey: true })).toEqual({ ligne: undefined, aDessinMoteur: true })
})

// --- Remise à zéro -------------------------------------------------------

test('/clear, /resume et /branch remettent le plan à zéro, pas la compaction', async ($, on) => {
  simulerMoteur(on)

  for (const source of ['clear', 'resume', 'fork'] as const) {
    await creerPlan($)
    expect((await lireBande($)).ligne, `avant ${source}`).toBeDefined()

    await $.classic.SessionStart({ source })
    expect((await lireBande($)).ligne, `après ${source}`).toBeUndefined()
  }

  await creerPlan($)
  await $.classic.SessionStart({ source: 'compact' })
  expect((await lireBande($)).ligne).toBeDefined()
})

// --- Commande et panneau -------------------------------------------------

test('/michi est déclarée immédiate et ouvre le panneau', async ($, on) => {
  const moteur = simulerMoteur(on)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/travail' })
  expect(moteur.commandes).toHaveLength(1)
  expect(moteur.commandes[0]).toMatchObject({ name: 'michi', immediate: true })

  const reponse = await lancerMichi($)

  expect(moteur.panneaux).toEqual([expect.objectContaining({ id: 'michi' })])
  expect(reponse.text).toBeUndefined()
})

test('/michi répond en texte là où aucun panneau n’est placé', async ($, on) => {
  const moteur = simulerMoteur(on)

  moteur.placePanneau = false
  await creerPlan($)
  await passer($, '1', 'completed')
  await passer($, '2', 'in_progress')

  const reponse = await lancerMichi($)

  expect(reponse.text).toBe(
    ['◆ Plan · 1/3', '✔ Écrire le parseur', '▶ Brancher la CLI', '○ Documenter'].join('\n'),
  )
})

test('le panneau liste les étapes : terminée, en cours, à faire', async ($, on) => {
  simulerMoteur(on)
  await $.tool.call({ tool: 'ExitPlanMode' })
  await creerPlan($)
  await passer($, '1', 'completed')
  await passer($, '2', 'in_progress')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANNEAU, surface })
    const enTete = await ui.find({ type: 'Text', text: '◆' })
    const terminee = await ui.find({ type: 'Text', text: '✔ Écrire le parseur' })
    const enCours = await ui.find({ type: 'Text', text: '▶ Brancher la CLI' })
    const aFaire = await ui.find({ type: 'Text', text: '○ Documenter' })

    expect(enTete?.text).toBe("◆ Migrer l'authentification · 1/3")
    expect(terminee?.props).toMatchObject({ dimColor: true })
    expect(enCours?.props).toMatchObject({ bold: true, color: 'yellow' })
    expect(aFaire?.props).toEqual({ wrap: 'truncate-end' })
    expect(await ui.findAll({ type: 'Text' })).toHaveLength(4)

    await ui.unmount()
  }
})

test('le panneau coupe les intitulés trop longs et dit quand il n’y a pas de plan', async ($, on) => {
  simulerMoteur(on)

  const vide = await $.ui.mount({ ...PANNEAU, surface: 'terminal' })

  expect((await vide.find({ type: 'Text' }))?.text).toBe('Aucun plan en cours.')
  await vide.unmount()

  await $.tool.call({
    tool: 'TaskCreate',
    subject: 'Un intitulé beaucoup trop long pour tenir dans les quarante colonnes du panneau',
    description: 'x',
  })

  const ui = await $.ui.mount({ ...PANNEAU, surface: 'terminal' })
  const etape = await ui.find({ type: 'Text', text: '○ ' })

  expect(largeur(etape?.text ?? '')).toBeLessThanOrEqual(PANNEAU.props.bodyColumns)
  expect(etape?.text).toEndWith('…')
  await ui.unmount()
})
