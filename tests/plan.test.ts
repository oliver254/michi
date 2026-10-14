import { describe, expect, test } from 'claude-code/testing'

import type { Plan, Status } from '../types'
import {
  EMPTY_PLAN,
  addTask,
  applyLedger,
  approvePlan,
  composeBand,
  composeList,
  displayWidth,
  extractTitle,
  isPlanDocument,
  locateLedger,
  parseLedger,
  parsePlanDocument,
  readSteps,
  replaceTasks,
  trackDocument,
  truncate,
  updateTask,
} from '../hooks/plan'

// Tests de la logique pure : aucune session, aucun moteur.

/** Fabrique un plan dont les étapes portent les statuts donnés, dans l'ordre. */
function planOf(statuses: Status[], title: string | null = null): Plan {
  return {
    title,
    document: null,
    steps: statuses.map((status, index) => ({
      id: String(index + 1),
      subject: `Étape ${index + 1}`,
      activeForm: `Réalisation de l'étape ${index + 1}`,
      status,
    })),
  }
}

/** Le texte de la bande, tous morceaux réunis. */
function bandText(plan: Plan, columns: number): string | null {
  return composeBand(plan, columns)?.map(segment => segment.text).join('') ?? null
}

describe('transitions', () => {
  test('TaskCreate ajoute une étape à faire', () => {
    const plan = addTask(EMPTY_PLAN, { id: '1', subject: 'Écrire le parseur' })

    expect(plan.steps).toEqual([
      { id: '1', subject: 'Écrire le parseur', activeForm: null, status: 'pending' },
    ])
  })

  test('TaskUpdate change le statut de la bonne étape', () => {
    const plan = updateTask(planOf(['pending', 'pending']), { id: '2', status: 'in_progress' })

    expect(plan.steps.map(step => step.status)).toEqual(['pending', 'in_progress'])
  })

  test('TaskUpdate sur une étape inconnue ne change rien', () => {
    const before = planOf(['pending'])

    expect(updateTask(before, { id: '42', status: 'completed' })).toEqual(before)
  })

  test('TaskUpdate « deleted » retire l’étape', () => {
    const plan = updateTask(planOf(['completed', 'pending']), { id: '2', status: 'deleted' })

    expect(plan.steps.map(step => step.id)).toEqual(['1'])
  })

  test('une tâche créée sur un plan terminé ouvre un nouveau plan sans l’ancien titre', () => {
    const finished = planOf(['completed', 'completed'], 'Ancien plan')
    const plan = addTask(finished, { id: '1', subject: 'Repartir' })

    expect(plan).toEqual({
      title: null,
      document: null,
      steps: [{ id: '1', subject: 'Repartir', activeForm: null, status: 'pending' }],
    })
  })

  test('TodoWrite remplace toute la liste, et une liste vide efface le plan', () => {
    const plan = replaceTasks(planOf(['pending'], 'Titre'), [
      { content: 'A', status: 'completed', activeForm: 'Fait A' },
      { content: 'B', status: 'in_progress', activeForm: 'Fait B' },
    ])

    expect(plan.title).toBe('Titre')
    expect(plan.steps.map(step => [step.subject, step.status])).toEqual([
      ['A', 'completed'],
      ['B', 'in_progress'],
    ])
    expect(replaceTasks(plan, [])).toEqual(EMPTY_PLAN)
  })

  test('ExitPlanMode donne son titre au plan et efface un plan terminé', () => {
    expect(approvePlan(planOf(['pending']), 'Nouveau')).toMatchObject({ title: 'Nouveau' })
    expect(approvePlan(planOf(['pending']), 'Nouveau').steps).toHaveLength(1)
    expect(approvePlan(planOf(['completed'], 'Ancien'), 'Nouveau')).toEqual({
      title: 'Nouveau',
      document: null,
      steps: [],
    })
  })

  test('le titre est la première ligne non vide du plan, sans marques Markdown', () => {
    expect(extractTitle('\n\n# Migrer `auth` vers **OIDC**\n\n## Étapes\n- a')).toBe(
      'Migrer auth vers OIDC',
    )
    expect(extractTitle('Simple ligne\nsuite')).toBe('Simple ligne')
    expect(extractTitle('   \n')).toBeNull()
    expect(extractTitle(null)).toBeNull()
  })
})

describe('outil d’étapes', () => {
  test('accepte une liste bien formée : forme active facultative, liste vide comprise', () => {
    expect(
      readSteps([
        { content: 'A', status: 'in_progress', activeForm: 'Fait A' },
        { content: 'B', status: 'pending' },
      ]),
    ).toEqual([
      { content: 'A', status: 'in_progress', activeForm: 'Fait A' },
      { content: 'B', status: 'pending' },
    ])
    expect(readSteps([])).toEqual([])
  })

  test('refuse ce qui n’est pas une liste d’étapes', () => {
    const malformed: unknown[] = [
      undefined,
      null,
      'Tester',
      { content: 'A', status: 'pending' },
      [null],
      ['A'],
      [{ status: 'pending' }],
      [{ content: '   ', status: 'pending' }],
      [{ content: 'A' }],
      [{ content: 'A', status: 'done' }],
      [{ content: 'A', status: 'pending', activeForm: 3 }],
      // Une seule étape fautive suffit à refuser la liste : on ne devine pas le reste.
      [{ content: 'A', status: 'pending' }, { content: 'B' }],
    ]

    for (const input of malformed) {
      expect(readSteps(input), JSON.stringify(input)).toBeNull()
    }
  })
})

describe('bande', () => {
  test('rien à composer sans étape', () => {
    expect(composeBand(EMPTY_PLAN, 80)).toBeNull()
    expect(composeBand({ title: 'Validé mais sans étape', document: null, steps: [] }, 80)).toBeNull()
  })

  test('suit le format attendu : titre, étape, barre, activité', () => {
    const plan = planOf(
      ['completed', 'completed', 'in_progress', 'pending', 'pending', 'pending', 'pending'],
      'Refonte',
    )

    expect(bandText(plan, 80)).toBe("◆ Refonte · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Réalisation de l'étape 3")
  })

  test('entre deux étapes, annonce la suivante ; à la fin, « terminé »', () => {
    expect(bandText(planOf(['completed', 'pending', 'pending']), 80)).toBe(
      '◆ Plan · étape 1/3 · ▰▱▱ · ○ Étape 2',
    )
    expect(bandText(planOf(['completed', 'completed']), 80)).toBe(
      '◆ Plan · étape 2/2 · ▰▰ · ✔ terminé',
    )
  })

  test('compte les étapes menées en parallèle', () => {
    expect(bandText(planOf(['in_progress', 'in_progress', 'pending']), 80)).toBe(
      "◆ Plan · étape 2/3 · ▰▰▱ · ▶ Réalisation de l'étape 1 (+1)",
    )
  })

  test('ramène la barre à dix cases pour un long plan', () => {
    const statuses: Status[] = Array.from({ length: 40 }, (_, index) =>
      index < 20 ? 'completed' : index === 20 ? 'in_progress' : 'pending',
    )

    expect(bandText(planOf(statuses), 120)).toContain(' · étape 21/40 · ▰▰▰▰▰▰▱▱▱▱ · ')
  })

  test('ne dépasse jamais la largeur donnée, quitte à couper le libellé', () => {
    const plan: Plan = {
      title: 'Un titre de plan vraiment très long qui ne tiendra pas dans la bande',
      document: null,
      steps: [
        {
          id: '1',
          subject: 'x',
          activeForm: 'Une forme active interminable qui déborde largement de la place disponible',
          status: 'in_progress',
        },
        { id: '2', subject: 'y', activeForm: null, status: 'pending' },
      ],
    }

    for (const columns of [120, 80, 60, 40, 30, 20]) {
      const text = bandText(plan, columns) ?? ''

      expect(displayWidth(text), `à ${columns} colonnes : ${text}`).toBeLessThanOrEqual(columns)
      expect(text).toContain('▶')
    }

    expect(bandText(plan, 60)).toContain('…')
  })
})

describe('largeur et troncature', () => {
  test('compte en cellules : deux pour le CJK et les emoji, zéro pour un combinant', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('日本語')).toBe(6)
    expect(displayWidth('🚀')).toBe(2)
    expect(displayWidth('e\u0301')).toBe(1)
  })

  test('coupe à la largeur, points de suspension compris', () => {
    expect(truncate('court', 10)).toBe('court')
    expect(truncate('Écriture du parseur', 10)).toBe('Écriture…')
    expect(displayWidth(truncate('日本語のテキスト', 7))).toBeLessThanOrEqual(7)
    expect(truncate('abc', 0)).toBe('')
  })
})

describe('liste', () => {
  test('une ligne par étape, sous l’en-tête', () => {
    expect(composeList(planOf(['completed', 'in_progress', 'pending'], 'Refonte'))).toBe(
      ['◆ Refonte · 1/3', '✔ Étape 1', '▶ Étape 2', '○ Étape 3'].join('\n'),
    )
    expect(composeList(EMPTY_PLAN)).toBe('Aucun plan en cours.')
  })
})

// --- Plans Superpowers ---------------------------------------------------

const PLAN_PATH = 'C:\\depot\\docs\\superpowers\\plans\\2026-10-12-t3-favoris.md'

/** Un document bâti comme les vrais : lots, identifiants de tâche, cases, et du code qui cite des titres. */
const DOCUMENT = [
  "# T3 — Favoris, filtres : plan d'implémentation",
  '',
  '> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.',
  '',
  '## Lot 1 — Socle',
  '',
  '### Task O1 : Ouvrir la version `0.4.0`',
  '',
  '- [x] **Step 1 : écrire le test**',
  '- [x] **Step 2 : le voir échouer**',
  '',
  '```markdown',
  '### Task 99: un titre cité dans du code',
  '- [ ] une case citée',
  '```',
  '',
  '### Task F1 : `MapFilter`, la valeur du filtre',
  '',
  '- [x] **Step 1**',
  '- [ ] **Step 2**',
  '',
  '## Lot 2 — Vue',
  '',
  '- [ ] une case hors de toute tâche',
  '',
  '### Task F10a : Le bouton rond',
  '',
  '- [ ] **Step 1**',
].join('\n')

/** Un registre bâti comme les vrais : journal libre, constats, tours de correction, clôtures. */
const LEDGER = [
  '# SDD ledger — plan: docs/superpowers/plans/2026-10-12-t3-favoris.md',
  '',
  '- F1 : exécutant sonnet → DONE ; relecture : conforme.',
  '- Task F1: minor (deferred): un détail remis à plus tard.',
  'Task F1: complete (commits c5d857a..a485f10, review clean)',
  'Task F10a: fix round 1/5 (2 addressed, 1 open)',
].join('\n')

/** Un plan sans aucune case cochée, à deux tâches numérotées. */
const BLANK_DOCUMENT = '# Refonte Implementation Plan\n### Task 1: A\n### Task 2: B'

describe('plans Superpowers', () => {
  test('reconnaît le document d’un plan à son chemin et situe son registre', () => {
    expect(isPlanDocument(PLAN_PATH)).toBe(true)
    expect(isPlanDocument('/depot/docs/superpowers/plans/plan.md')).toBe(true)
    expect(isPlanDocument('/depot/docs/superpowers/specs/cadrage.md')).toBe(false)
    expect(isPlanDocument('/depot/README.md')).toBe(false)

    expect(locateLedger(PLAN_PATH)).toBe('C:\\depot/.superpowers/sdd/2026-10-12-t3-favoris/progress.md')
    expect(locateLedger('/depot/docs/superpowers/plans/plan.md')).toBe(
      '/depot/.superpowers/sdd/plan/progress.md',
    )
    expect(locateLedger('/depot/README.md')).toBeNull()
  })

  test('lit le titre, les tâches et leurs cases, sans se laisser tromper par le code cité', () => {
    expect(parsePlanDocument(DOCUMENT)).toEqual({
      title: 'T3 — Favoris, filtres',
      tasks: [
        { id: 'O1', subject: 'O1 — Ouvrir la version 0.4.0', boxes: 2, checked: 2 },
        { id: 'F1', subject: 'F1 — MapFilter, la valeur du filtre', boxes: 2, checked: 1 },
        { id: 'F10a', subject: 'F10a — Le bouton rond', boxes: 1, checked: 0 },
      ],
    })
  })

  test('accepte les variantes d’écriture des titres de plan et de tâche', () => {
    const document = parsePlanDocument(
      [
        '# Ordres ouverts Implementation Plan',
        '## Task 1 : Domaine — port de lecture',
        '## Task 2 — Infrastructure',
        '### Tâche 3 : Web',
        '### Task 10 bis: Reprise',
      ].join('\n'),
    )

    expect(document?.title).toBe('Ordres ouverts')
    expect(document?.tasks.map(task => [task.id, task.subject])).toEqual([
      ['1', 'Domaine — port de lecture'],
      ['2', 'Infrastructure'],
      ['3', 'Web'],
      ['10 bis', '10 bis — Reprise'],
    ])
    expect(
      parsePlanDocument("# Cœur logique — Plan d'implémentation (plan 1/3)\n### Tâche 1 : A")?.title,
    ).toBe('Cœur logique (plan 1/3)')
  })

  test('ne prend pas pour un plan un texte sans titre ou sans tâche', () => {
    expect(parsePlanDocument(null)).toBeNull()
    expect(parsePlanDocument('Un simple paragraphe\n### Task 1: A')).toBeNull()
    expect(parsePlanDocument('# Un document\n\n## Contexte\n\nDu texte.')).toBeNull()
  })

  test('lit dans le registre les tâches closes et celles dont il parle', () => {
    expect(parseLedger(LEDGER)).toEqual({ closed: ['f1'], mentioned: ['f1', 'f10a'] })
    expect(parseLedger(null)).toBeNull()
  })

  test('sans registre, la jauge vient des cases du document', () => {
    const document = parsePlanDocument(DOCUMENT)!
    const plan = trackDocument(EMPTY_PLAN, PLAN_PATH, document, null)

    expect(plan.title).toBe('T3 — Favoris, filtres')
    expect(plan.document).toEqual({ path: PLAN_PATH, hasLedger: false })
    expect(plan.steps.map(step => [step.id, step.status])).toEqual([
      ['O1', 'completed'],
      ['F1', 'in_progress'],
      ['F10a', 'pending'],
    ])
  })

  test('avec un registre, une tâche close ou citée avance même sans case cochée', () => {
    const document = parsePlanDocument(DOCUMENT)!
    const plan = trackDocument(EMPTY_PLAN, PLAN_PATH, document, parseLedger(LEDGER))

    expect(plan.document?.hasLedger).toBe(true)
    expect(plan.steps.map(step => step.status)).toEqual(['completed', 'completed', 'in_progress'])
    expect(bandText(plan, 80)).toBe(
      '◆ T3 — Favoris, filtres · étape 3/3 · ▰▰▰ · ▶ F10a — Le bouton rond',
    )
  })

  test('une tâche vue close le reste quand le registre disparaît en fin de plan', () => {
    const document = parsePlanDocument(DOCUMENT)!
    const withLedger = trackDocument(EMPTY_PLAN, PLAN_PATH, document, parseLedger(LEDGER))
    const withoutLedger = trackDocument(withLedger, PLAN_PATH.replace(/\\/g, '/'), document, null)

    expect(withoutLedger.steps.map(step => step.status)).toEqual([
      'completed',
      'completed',
      'in_progress',
    ])
    expect(withoutLedger.document?.hasLedger).toBe(true)
  })

  test('des tâches de session en cours ne sont pas effacées par un plan qui n’a rien consigné', () => {
    const blank = parsePlanDocument(BLANK_DOCUMENT)!
    const session = planOf(['completed', 'in_progress'])

    // Rien de consigné : le document ne fait que nommer le plan.
    expect(trackDocument(session, PLAN_PATH, blank, null)).toEqual({ ...session, title: 'Refonte' })
    // Un registre existe : c'est le plan Superpowers qui fait foi.
    expect(trackDocument(session, PLAN_PATH, blank, { closed: [], mentioned: [] }).document).toEqual({
      path: PLAN_PATH,
      hasLedger: true,
    })
  })

  test('le registre relu ne fait qu’avancer la jauge, et ne change rien s’il n’a pas bougé', () => {
    const start = trackDocument(EMPTY_PLAN, PLAN_PATH, parsePlanDocument(BLANK_DOCUMENT)!, {
      closed: [],
      mentioned: [],
    })
    const advanced = applyLedger(start, { closed: ['1'], mentioned: ['2'] })

    expect(advanced.steps.map(step => step.status)).toEqual(['completed', 'in_progress'])
    // Même registre : le plan revient tel quel, pour ne rien redessiner.
    expect(applyLedger(advanced, { closed: ['1'], mentioned: ['2'] })).toBe(advanced)
    // Un registre amputé ne fait pas reculer une tâche close.
    expect(applyLedger(advanced, { closed: [], mentioned: [] })).toBe(advanced)
    // Sans plan suivi, le registre ne concerne personne.
    expect(applyLedger(EMPTY_PLAN, { closed: ['1'], mentioned: [] })).toBe(EMPTY_PLAN)
  })

  test('les tâches de la session remplacent un simple aperçu, pas un plan qui tient son registre', () => {
    const document = parsePlanDocument(BLANK_DOCUMENT)!
    const preview = trackDocument(EMPTY_PLAN, PLAN_PATH, document, null)
    const held = trackDocument(EMPTY_PLAN, PLAN_PATH, document, { closed: [], mentioned: [] })

    expect(addTask(preview, { id: '7', subject: 'Tâche de session' })).toEqual({
      title: 'Refonte',
      document: null,
      steps: [{ id: '7', subject: 'Tâche de session', activeForm: null, status: 'pending' }],
    })
    expect(addTask(held, { id: '7', subject: 'Tâche de session' })).toBe(held)
    expect(replaceTasks(held, [{ content: 'X', status: 'pending' }])).toBe(held)
    expect(replaceTasks(preview, [])).toBe(preview)
    // L'identifiant « 1 » d'une tâche de session n'est pas la tâche 1 du plan.
    expect(updateTask(preview, { id: '1', status: 'completed' })).toBe(preview)
  })

  test('un plan validé en mode plan met fin au suivi du plan Superpowers', () => {
    const held = trackDocument(EMPTY_PLAN, PLAN_PATH, parsePlanDocument(BLANK_DOCUMENT)!, {
      closed: [],
      mentioned: [],
    })

    expect(approvePlan(held, 'Autre plan')).toEqual({ title: 'Autre plan', document: null, steps: [] })
  })
})
