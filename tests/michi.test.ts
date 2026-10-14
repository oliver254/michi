import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

import { displayWidth } from '../hooks/plan'

// Tests du mod à travers le moteur : on déclenche les événements comme Claude Code le ferait,
// et on lit ce que les hooks ont dessiné. Aucune session, aucun outil réel.

/** Ce que le « moteur » du test dessine dans la bande quand le mod lui passe la main. */
const ENGINE_DRAWING = 'engine drawing'

/** Le plan d'exemple : intitulé et forme active de chaque tâche. */
const TASKS = [
  ['Écrire le parseur', 'Écriture du parseur'],
  ['Brancher la CLI', 'Branchement de la CLI'],
  ['Documenter', 'Rédaction de la documentation'],
] as const

/** Ce que Claude Code passe à un hook `ui.render` pour la bande, hors surface. */
const BAND = {
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
const PANE = {
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
 * Répond à la place de Claude Code : résultats d'outils, fichiers, dessin de la bande, commandes,
 * panneaux. Renvoie de quoi régler ces réponses et relire ce que le mod a demandé.
 * À appeler avant le premier appel sur `$` : le kit refuse un `on` tardif.
 */
function fakeEngine(on: On) {
  const engine = {
    /** Les prochains appels d'outil sont refusés. */
    denies: false,
    /** Les prochains appels d'outil échouent. */
    fails: false,
    /** TaskUpdate répond « tâche inconnue », sans erreur. */
    unknownTask: false,
    /** Le texte du plan qu'ExitPlanMode renvoie une fois accepté. */
    approvedPlan: "# Migrer l'authentification\n\n1. Écrire le parseur\n2. Brancher la CLI" as string | null,
    /** `$.ui.open` place le panneau. */
    placesPane: true,
    /** Les commandes que le mod a déclarées. */
    commands: [] as unknown[],
    /** Les panneaux que le mod a ouverts. */
    panes: [] as unknown[],
    /** Les fichiers que le mod peut lire, par fin de chemin (barres obliques). */
    files: new Map<string, string>(),
    /** Les chemins que le mod a demandé à lire. */
    reads: [] as string[],
    /** Les outils que la session offre déjà au modèle, par leur nom. */
    nativeTools: ['Read', 'Edit', 'Bash'],
    /** Les outils que le mod a déclarés. */
    tools: [] as unknown[],
    /** Ce qu'un autre mod, plus bas, a déjà glissé à Claude après ExitPlanMode. */
    planContext: undefined as string[] | undefined,
  }
  let lastId = 0

  on('tool.call', (_$, e) => {
    if (engine.denies) {
      return { deny: 'denied by the test' }
    }

    if (engine.fails) {
      return { isError: true, result: 'simulated failure', text: 'simulated failure' }
    }

    // L'outil d'un mod n'a rien sous lui : si son hook ne répond pas, l'appel échoue.
    if (e.tool.startsWith('mcp__michi__')) {
      return { isError: true, result: 'no hook answered', text: 'no hook answered' }
    }

    // Les résultats ont la forme que les types de cette version donnent à chaque outil.
    if (e.tool === 'TodoWrite') {
      return { result: { oldTodos: [], newTodos: e.todos } }
    }

    if (e.tool === 'TaskCreate') {
      lastId += 1

      return { result: { task: { id: String(lastId), subject: e.subject } } }
    }

    if (e.tool === 'TaskUpdate') {
      return engine.unknownTask
        ? { result: { success: false, taskId: e.taskId, updatedFields: [], error: 'Task not found' } }
        : { result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }
    }

    if (e.tool === 'ExitPlanMode') {
      return { result: { plan: engine.approvedPlan, isAgent: false }, context: engine.planContext }
    }

    return { result: 'ok' }
  })
  on('tool.list', () => ({
    value: engine.nativeTools.map(name => ({ name, description: name, mcp: false })),
  }))
  on('tool.register', (_$, e) => {
    engine.tools.push(e)

    return { value: { tool: `mcp__michi__${e.name}` } }
  })
  on('fs.read', (_$, e) => {
    // Le chemin arrive absolu, écrit à la façon du système : on compare sa fin.
    const path = e.path.replace(/\\/g, '/')
    const found = [...engine.files].find(([suffix]) => path.endsWith(suffix))

    engine.reads.push(path)

    return found === undefined ? { deny: `missing file: ${path}` } : { value: found[1] }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: [ENGINE_DRAWING] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))
  on('command.register', (_$, e) => {
    engine.commands.push(e)

    return { value: { command: e.name } }
  })
  on('ui.open', (_$, e) => {
    engine.panes.push(e)

    return {
      value: engine.placesPane
        ? { isPlaced: true }
        : { isPlaced: false, reason: 'no surface places a pane' },
    }
  })

  return engine
}

/** Crée le plan d'exemple, une tâche par appel à TaskCreate (identifiants « 1 », « 2 », « 3 »). */
async function createPlan($: Engine) {
  for (const [subject, activeForm] of TASKS) {
    await $.tool.call({ tool: 'TaskCreate', subject, description: subject, activeForm })
  }
}

/** Change le statut d'une tâche, comme Claude le ferait avec TaskUpdate. */
function setStatus($: Engine, taskId: string, status: 'in_progress' | 'completed') {
  return $.tool.call({ tool: 'TaskUpdate', taskId, status })
}

/** Tape /michi au prompt d'un terminal plein écran. */
function runMichi($: Engine) {
  return $.command.run({
    command: 'michi',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 140 },
  })
}

/** Dessine la bande sur le terminal et renvoie la ligne du mod (`undefined` s'il n'a rien dessiné). */
async function readBand($: Engine, props: Partial<RenderPropsOf['AbovePrompt']> = {}) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, ...props } })
  const line = await ui.find({ type: 'Text', text: '◆' })
  const engineDrawing = await ui.find({ type: 'Text', text: ENGINE_DRAWING })

  await ui.unmount()

  return { line: line?.text, hasEngineDrawing: engineDrawing !== undefined }
}

// --- Capture du plan et bande --------------------------------------------

test('sans plan, la bande est laissée au moteur', async ($, on) => {
  fakeEngine(on)

  expect(await readBand($)).toEqual({ line: undefined, hasEngineDrawing: true })
})

test('plan créé : la bande annonce la première étape à venir', async ($, on) => {
  fakeEngine(on)
  await createPlan($)

  expect((await readBand($)).line).toBe('◆ Plan · étape 0/3 · ▱▱▱ · ○ Écrire le parseur')
})

test('tâche passée en cours : la bande montre sa forme active', async ($, on) => {
  fakeEngine(on)
  await createPlan($)
  await setStatus($, '1', 'in_progress')

  expect((await readBand($)).line).toBe('◆ Plan · étape 1/3 · ▰▱▱ · ▶ Écriture du parseur')
})

test('tâche terminée : la case reste pleine et la suivante est annoncée', async ($, on) => {
  fakeEngine(on)
  await createPlan($)
  await setStatus($, '1', 'in_progress')
  await setStatus($, '1', 'completed')

  expect((await readBand($)).line).toBe('◆ Plan · étape 1/3 · ▰▱▱ · ○ Brancher la CLI')
})

test('plan terminé : toutes les cases sont pleines', async ($, on) => {
  fakeEngine(on)
  await createPlan($)

  for (const id of ['1', '2', '3']) {
    await setStatus($, id, 'completed')
  }

  expect((await readBand($)).line).toBe('◆ Plan · étape 3/3 · ▰▰▰ · ✔ terminé')
})

test('la bande déjà affichée suit le plan sans être redemandée', async ($, on) => {
  fakeEngine(on)
  await createPlan($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const before = (await ui.find({ type: 'Text', text: '◆' }))?.text

    // L'écriture dans `$.state` suffit à redessiner : le test ne remonte rien.
    await setStatus($, '2', 'in_progress')
    const active = await ui.find({ type: 'Text', text: /^▶ / })

    expect(before).toContain('○ ')
    expect(active?.text).toBe('▶ Branchement de la CLI')
    expect(active?.props).toEqual({ color: 'yellow', bold: true })

    await setStatus($, '2', 'completed')
    await ui.unmount()
  }
})

test('ExitPlanMode accepté donne son titre au plan', async ($, on) => {
  fakeEngine(on)
  await $.tool.call({ tool: 'ExitPlanMode' })
  await createPlan($)

  expect((await readBand($)).line).toBe(
    "◆ Migrer l'authentification · étape 0/3 · ▱▱▱ · ○ Écrire le parseur",
  )
})

test('ExitPlanMode refusé par l’utilisateur ne change pas le titre', async ($, on) => {
  const engine = fakeEngine(on)

  engine.fails = true
  await $.tool.call({ tool: 'ExitPlanMode' })
  engine.fails = false
  await createPlan($)

  expect((await readBand($)).line).toStartWith('◆ Plan · ')
})

test('TodoWrite remplace la liste à chaque appel', async ($, on) => {
  fakeEngine(on)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Lire le code', status: 'completed', activeForm: 'Lecture du code' },
      { content: 'Corriger le bug', status: 'in_progress', activeForm: 'Correction du bug' },
      { content: 'Tester', status: 'pending', activeForm: 'Exécution des tests' },
      { content: 'Livrer', status: 'pending', activeForm: 'Livraison' },
    ],
  })

  expect((await readBand($)).line).toBe('◆ Plan · étape 2/4 · ▰▰▱▱ · ▶ Correction du bug')
})

test('un appel refusé ou en échec ne change pas le plan', async ($, on) => {
  const engine = fakeEngine(on)

  await createPlan($)
  const expected = '◆ Plan · étape 0/3 · ▱▱▱ · ○ Écrire le parseur'

  engine.denies = true
  await setStatus($, '1', 'in_progress')
  await $.tool.call({ tool: 'TaskCreate', subject: 'En trop', description: 'En trop' })
  expect((await readBand($)).line).toBe(expected)

  engine.denies = false
  engine.fails = true
  await setStatus($, '1', 'in_progress')
  await $.tool.call({ tool: 'TodoWrite', todos: [] })
  expect((await readBand($)).line).toBe(expected)

  engine.fails = false
  engine.unknownTask = true
  await setStatus($, '1', 'completed')
  expect((await readBand($)).line).toBe(expected)
})

test('les appels venant d’un subagent sont ignorés', async ($, on) => {
  fakeEngine(on)
  await createPlan($)

  // Le type de `$.tool.call` ne déclare pas `agentId`, mais le kit le transmet aux hooks
  // comme le fait la boucle d'un subagent : d'où le `as never`.
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed', agentId: 'agent-7' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Du subagent', description: 'x', agentId: 'agent-7' } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [], agentId: 'agent-7' } as never)
  await $.tool.call({ tool: 'ExitPlanMode', agentId: 'agent-7' } as never)

  expect((await readBand($)).line).toBe('◆ Plan · étape 0/3 · ▱▱▱ · ○ Écrire le parseur')
})

test('le libellé est coupé à la largeur de la bande', async ($, on) => {
  fakeEngine(on)
  await $.tool.call({
    tool: 'TaskCreate',
    subject: 'Refondre',
    description: 'Refondre',
    activeForm: 'Refonte complète du module de facturation et de tous ses rapports mensuels',
  })
  await setStatus($, '1', 'in_progress')

  const { line = '' } = await readBand($, { bodyColumns: 48 })

  expect(displayWidth(line)).toBeLessThanOrEqual(48)
  expect(line).toStartWith('◆ Plan · étape 1/1 · ▰ · ▶ Refonte')
  expect(line).toEndWith('…')
})

test('ce que dessinent les autres mods reste affiché sous la ligne du mod', async ($, on) => {
  fakeEngine(on)
  await createPlan($)

  const { line, hasEngineDrawing } = await readBand($)

  expect(line).toBeDefined()
  expect(hasEngineDrawing).toBe(true)
})

test('une enquête garde la bande pour elle', async ($, on) => {
  fakeEngine(on)
  await createPlan($)

  expect(await readBand($, { hasSurvey: true })).toEqual({ line: undefined, hasEngineDrawing: true })
})

// --- Outil d'étapes ------------------------------------------------------

/** La liste que Claude passe à l'outil d'étapes du mod : la même forme que TodoWrite. */
const STEPS = [
  { content: 'Lire le code', status: 'completed', activeForm: 'Lecture du code' },
  { content: 'Corriger le bug', status: 'in_progress', activeForm: 'Correction du bug' },
  { content: 'Tester', status: 'pending', activeForm: 'Exécution des tests' },
  { content: 'Livrer', status: 'pending' },
]

/** Démarre la session, comme Claude Code à l'ouverture et à chaque rechargement du mod. */
function startSession($: Engine) {
  return $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

/** Appelle l'outil d'étapes du mod, comme Claude le ferait. */
function declareSteps($: Engine, steps: unknown = STEPS) {
  return $.tool.call({ tool: 'mcp__michi__steps', steps })
}

test('sans outil de tâches dans la session, le mod déclare le sien, visible d’emblée', async ($, on) => {
  const engine = fakeEngine(on)

  await startSession($)

  // `isDeferred: false` : Claude a le schéma sous les yeux, sans passer par ToolSearch.
  expect(engine.tools).toEqual([expect.objectContaining({ name: 'steps', isDeferred: false })])
})

test('là où la session a déjà un outil de tâches, le mod n’ajoute ni outil ni consigne', async ($, on) => {
  const engine = fakeEngine(on)

  for (const native of ['TaskCreate', 'TodoWrite']) {
    engine.nativeTools = ['Read', native]
    await startSession($)

    expect(engine.tools, native).toEqual([])
    expect((await $.tool.call({ tool: 'ExitPlanMode' })).context, native).toBeUndefined()
  }
})

test('plan validé puis étapes déclarées : la jauge porte le titre du plan et avance', async ($, on) => {
  fakeEngine(on)
  await $.tool.call({ tool: 'ExitPlanMode' })

  const answer = await declareSteps($)

  expect((await readBand($)).line).toBe(
    "◆ Migrer l'authentification · étape 2/4 · ▰▰▱▱ · ▶ Correction du bug",
  )
  // Claude lit où en est la jauge : une étape terminée sur quatre.
  expect(answer.result).toContain('1/4')

  await declareSteps($, [
    STEPS[0],
    { ...STEPS[1], status: 'completed' },
    { ...STEPS[2], status: 'in_progress' },
    STEPS[3],
  ])

  expect((await readBand($)).line).toBe(
    "◆ Migrer l'authentification · étape 3/4 · ▰▰▰▱ · ▶ Exécution des tests",
  )
})

test('ExitPlanMode accepté glisse à Claude la consigne de déclarer ses étapes', async ($, on) => {
  const engine = fakeEngine(on)

  engine.planContext = ['note d’un autre mod']

  const answer = await $.tool.call({ tool: 'ExitPlanMode' })

  // La consigne s'ajoute à ce que les mods du dessous ont déjà glissé, sans le remplacer.
  expect(answer.context).toEqual([
    'note d’un autre mod',
    expect.stringContaining('mcp__michi__steps'),
  ])
  // Le résultat de l'outil, lui, reste celui du moteur.
  expect(answer.result).toEqual({ plan: engine.approvedPlan, isAgent: false })
})

test('plan refusé, ou validé par un subagent : pas de consigne', async ($, on) => {
  const engine = fakeEngine(on)

  engine.fails = true
  expect((await $.tool.call({ tool: 'ExitPlanMode' })).context).toBeUndefined()

  engine.fails = false
  expect(
    (await $.tool.call({ tool: 'ExitPlanMode', agentId: 'agent-7' } as never)).context,
  ).toBeUndefined()
})

test('une liste mal formée est refusée à Claude sans toucher à la jauge', async ($, on) => {
  fakeEngine(on)
  await declareSteps($)

  const answer = await declareSteps($, [{ content: 'Sans statut' }])

  expect(answer.deny).toContain('steps')
  expect((await readBand($)).line).toBe('◆ Plan · étape 2/4 · ▰▰▱▱ · ▶ Correction du bug')
})

test('l’appel d’un subagent reçoit une réponse mais ne change pas la jauge', async ($, on) => {
  fakeEngine(on)
  await declareSteps($)

  const answer = await $.tool.call({
    tool: 'mcp__michi__steps',
    steps: [{ content: 'Du subagent', status: 'in_progress' }],
    agentId: 'agent-7',
  } as never)

  expect(answer.isError).toBeUndefined()
  expect(answer.deny).toBeUndefined()
  expect((await readBand($)).line).toBe('◆ Plan · étape 2/4 · ▰▰▱▱ · ▶ Correction du bug')
})

// --- Plans Superpowers ---------------------------------------------------

/** Le document d'un plan Superpowers et son registre, là où Superpowers les range. */
const PLAN_PATH = '/depot/docs/superpowers/plans/2026-10-12-convertisseur.md'
const PLAN_SUFFIX = 'docs/superpowers/plans/2026-10-12-convertisseur.md'
const LEDGER_SUFFIX = '.superpowers/sdd/2026-10-12-convertisseur/progress.md'

const SUPERPOWERS_PLAN = [
  '# Convertisseur de températures Implementation Plan',
  '',
  '> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.',
  '',
  '### Task 1: Conversion Celsius vers Fahrenheit',
  '- [ ] **Step 1: Write the failing test**',
  '',
  '### Task 2: Conversion inverse',
  '- [ ] **Step 1: Write the failing test**',
  '',
  '### Task 3: Ligne de commande',
  '- [ ] **Step 1: Write the failing test**',
].join('\n')

const OPEN_LEDGER = `# SDD ledger — plan: ${PLAN_SUFFIX}\n`

/** La session lit le document du plan, comme le fait l'exécuteur au démarrage. */
function readSuperpowersPlan($: Engine) {
  return $.tool.call({ tool: 'Read', file_path: PLAN_PATH })
}

test('un plan Superpowers lu par la session donne sa jauge', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  await readSuperpowersPlan($)

  expect((await readBand($, { bodyColumns: 120 })).line).toBe(
    '◆ Convertisseur de températures · étape 0/3 · ▱▱▱ · ○ Conversion Celsius vers Fahrenheit',
  )
})

test('un plan Superpowers que la session vient d’écrire donne aussi sa jauge', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: SUPERPOWERS_PLAN })

  expect((await readBand($, { bodyColumns: 120 })).line).toStartWith(
    '◆ Convertisseur de températures · étape 0/3 · ',
  )
})

test('le registre fait avancer la jauge après chaque commande de la session', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  engine.files.set(LEDGER_SUFFIX, OPEN_LEDGER)
  await readSuperpowersPlan($)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: '◆' }))?.text).toContain('étape 0/3 · ▱▱▱ · ')

  // L'exécuteur clôt la tâche 1 et reçoit le rapport de la tâche 2 : deux lignes de plus au registre.
  engine.files.set(
    LEDGER_SUFFIX,
    `${OPEN_LEDGER}Task 1: complete (commits a1b2c3d..d4e5f6a, review clean)\nTask 2: implementer DONE (b7c8d9e)\n`,
  )
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: conversion"' })

  // La bande déjà affichée suit, sans être redemandée.
  expect((await ui.find({ type: 'Text', text: '◆' }))?.text).toBe(
    '◆ Convertisseur de températures · étape 2/3 · ▰▰▱ · ▶ Conversion inverse',
  )
  await ui.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await pane.findAll({ type: 'Text' })).map(line => line.text)).toEqual([
    '◆ Convertisseur de températures · 1/3',
    '✔ Conversion Celsius vers Fahrenheit',
    '▶ Conversion inverse',
    '○ Ligne de commande',
  ])
  await pane.unmount()
})

test('les tâches de la session n’effacent pas un plan Superpowers qui tient son registre', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  engine.files.set(LEDGER_SUFFIX, OPEN_LEDGER)
  await readSuperpowersPlan($)
  await createPlan($)
  await setStatus($, '1', 'completed')

  expect((await readBand($, { bodyColumns: 120 })).line).toBe(
    '◆ Convertisseur de températures · étape 0/3 · ▱▱▱ · ○ Conversion Celsius vers Fahrenheit',
  )
})

test('un plan Superpowers qui tient son registre garde la jauge, et l’outil d’étapes le dit à Claude', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  engine.files.set(LEDGER_SUFFIX, OPEN_LEDGER)
  await readSuperpowersPlan($)

  const answer = await declareSteps($)

  expect(answer.result).toContain('Superpowers')
  expect((await readBand($, { bodyColumns: 120 })).line).toBe(
    '◆ Convertisseur de températures · étape 0/3 · ▱▱▱ · ○ Conversion Celsius vers Fahrenheit',
  )
})

test('sans registre, les tâches de la session remplacent l’aperçu du plan et gardent son titre', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  await readSuperpowersPlan($)
  await createPlan($)
  await setStatus($, '1', 'in_progress')

  expect((await readBand($)).line).toBe(
    '◆ Convertisseur de températures · étape 1/3 · ▰▱▱ · ▶ Écriture du parseur',
  )
})

test('le plan lu par un subagent, ou une lecture en échec, ne change rien', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  await $.tool.call({ tool: 'Read', file_path: PLAN_PATH, agentId: 'agent-7' } as never)
  engine.fails = true
  await readSuperpowersPlan($)

  expect((await readBand($)).line).toBeUndefined()
  expect(engine.reads).toEqual([])
})

test('le mod ne lit que le document du plan et son registre', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  engine.files.set(LEDGER_SUFFIX, OPEN_LEDGER)

  // Sans plan Superpowers suivi, aucun fichier n'est lu, quoi que fasse la session.
  await $.tool.call({ tool: 'Read', file_path: '/depot/README.md' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Edit', file_path: '/depot/src/app.ts', old_string: 'a', new_string: 'b' })
  expect(engine.reads).toEqual([])

  await readSuperpowersPlan($)
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(engine.reads.every(path => path.endsWith(PLAN_SUFFIX) || path.endsWith(LEDGER_SUFFIX))).toBe(true)
  expect(engine.reads.filter(path => path.endsWith(PLAN_SUFFIX))).toHaveLength(1)
  expect(engine.reads.filter(path => path.endsWith(LEDGER_SUFFIX))).toHaveLength(2)
})

// --- Remise à zéro -------------------------------------------------------

test('/clear met fin au suivi d’un plan Superpowers', async ($, on) => {
  const engine = fakeEngine(on)

  engine.files.set(PLAN_SUFFIX, SUPERPOWERS_PLAN)
  engine.files.set(LEDGER_SUFFIX, OPEN_LEDGER)
  await readSuperpowersPlan($)
  await $.classic.SessionStart({ source: 'clear' })
  engine.reads.length = 0
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect((await readBand($)).line).toBeUndefined()
  expect(engine.reads).toEqual([])
})

test('/clear, /resume et /branch remettent le plan à zéro, pas la compaction', async ($, on) => {
  fakeEngine(on)

  for (const source of ['clear', 'resume', 'fork'] as const) {
    await createPlan($)
    expect((await readBand($)).line, `avant ${source}`).toBeDefined()

    await $.classic.SessionStart({ source })
    expect((await readBand($)).line, `après ${source}`).toBeUndefined()
  }

  await createPlan($)
  await $.classic.SessionStart({ source: 'compact' })
  expect((await readBand($)).line).toBeDefined()
})

// --- Commande et panneau -------------------------------------------------

test('/michi est déclarée immédiate et ouvre le panneau', async ($, on) => {
  const engine = fakeEngine(on)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(engine.commands).toHaveLength(1)
  expect(engine.commands[0]).toMatchObject({ name: 'michi', immediate: true })

  const answer = await runMichi($)

  expect(engine.panes).toEqual([expect.objectContaining({ id: 'michi' })])
  expect(answer.text).toBeUndefined()
})

test('/michi répond en texte là où aucun panneau n’est placé', async ($, on) => {
  const engine = fakeEngine(on)

  engine.placesPane = false
  await createPlan($)
  await setStatus($, '1', 'completed')
  await setStatus($, '2', 'in_progress')

  const answer = await runMichi($)

  expect(answer.text).toBe(
    ['◆ Plan · 1/3', '✔ Écrire le parseur', '▶ Brancher la CLI', '○ Documenter'].join('\n'),
  )
})

test('le panneau liste les étapes : terminée, en cours, à faire', async ($, on) => {
  fakeEngine(on)
  await $.tool.call({ tool: 'ExitPlanMode' })
  await createPlan($)
  await setStatus($, '1', 'completed')
  await setStatus($, '2', 'in_progress')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const header = await ui.find({ type: 'Text', text: '◆' })
    const done = await ui.find({ type: 'Text', text: '✔ Écrire le parseur' })
    const running = await ui.find({ type: 'Text', text: '▶ Brancher la CLI' })
    const pending = await ui.find({ type: 'Text', text: '○ Documenter' })

    expect(header?.text).toBe("◆ Migrer l'authentification · 1/3")
    expect(done?.props).toMatchObject({ dimColor: true })
    expect(running?.props).toMatchObject({ bold: true, color: 'yellow' })
    expect(pending?.props).toEqual({ wrap: 'truncate-end' })
    expect(await ui.findAll({ type: 'Text' })).toHaveLength(4)

    await ui.unmount()
  }
})

test('le panneau coupe les intitulés trop longs et dit quand il n’y a pas de plan', async ($, on) => {
  fakeEngine(on)

  const empty = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await empty.find({ type: 'Text' }))?.text).toBe('Aucun plan en cours.')
  await empty.unmount()

  await $.tool.call({
    tool: 'TaskCreate',
    subject: 'Un intitulé beaucoup trop long pour tenir dans les quarante colonnes du panneau',
    description: 'x',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const step = await ui.find({ type: 'Text', text: '○ ' })

  expect(displayWidth(step?.text ?? '')).toBeLessThanOrEqual(PANE.props.bodyColumns)
  expect(step?.text).toEndWith('…')
  await ui.unmount()
})
