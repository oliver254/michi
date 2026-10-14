import type { Plan, Status, Step } from '../types'

// Logique pure du mod : transitions du plan et mise en forme de la bande.
// Aucun appel au moteur ici, pour que tout se teste sans session.

/** Plan vide : valeur initiale de l'état, et valeur après /clear, /resume ou /branch. */
export const EMPTY_PLAN: Plan = { title: null, steps: [], document: null }

/** Titre affiché tant qu'aucun plan n'a été validé par ExitPlanMode. */
export const DEFAULT_TITLE = 'Plan'

/** Glyphe de chaque statut, dans la bande comme dans le panneau. */
export const GLYPHS: Record<Status, string> = {
  completed: '✔',
  in_progress: '▶',
  pending: '○',
}

/** Rôle d'un morceau de la bande ; le module de hooks en déduit le style. */
export type Tone = 'title' | 'muted' | 'done' | 'active'

/** Un morceau de la bande : son texte et son rôle. */
export type Segment = { text: string; tone: Tone }

/** Une tâche telle que TodoWrite la décrit ; l'outil d'étapes du mod reprend cette forme. */
export type Task = { content: string; status: Status; activeForm?: string }

/** Nombre maximal de cases de la barre ; au-delà, les étapes sont ramenées à cette échelle. */
const MAX_CELLS = 10

/** Place minimale à laisser au titre et au libellé ; en dessous, on retire la barre, puis le titre. */
const MIN_ROOM = 16

const SEPARATOR = ' · '

// --- Transitions du plan -------------------------------------------------

/** Ramène un libellé sur une seule ligne : un retour à la ligne casserait la bande. */
function clean(text: string): string {
  return text.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim()
}

/** Vrai quand le plan a des étapes et qu'elles sont toutes terminées. */
function isFinished(plan: Plan): boolean {
  return plan.steps.length > 0 && plan.steps.every(step => step.status === 'completed')
}

/**
 * Vrai quand la jauge appartient à un plan Superpowers qui tient son propre avancement
 * (registre trouvé, ou tâche déjà entamée) : les tâches de la session ne la modifient plus.
 */
function isHeldByDocument(plan: Plan): boolean {
  return (
    plan.document !== null &&
    (plan.document.hasLedger || plan.steps.some(step => step.status !== 'pending'))
  )
}

/**
 * Tant que le plan Superpowers n'a rien consigné, ses tâches ne sont qu'un aperçu :
 * les tâches de la session reprennent la main, et n'en gardent que le titre.
 */
function leavePreview(plan: Plan): Plan {
  return plan.document === null ? plan : { title: plan.title, steps: [], document: null }
}

/**
 * TodoWrite : la liste entière est remplacée.
 * Une liste neuve écrite sur un plan terminé ouvre un nouveau plan, qui ne garde pas l'ancien titre ;
 * une liste qui reprend toutes ses étapes et en ajoute d'autres le prolonge.
 */
export function replaceTasks(plan: Plan, tasks: readonly Task[]): Plan {
  if (isHeldByDocument(plan)) {
    return plan
  }

  if (tasks.length === 0) {
    // Une liste vidée efface le plan de la session, pas l'aperçu d'un plan Superpowers.
    return plan.document === null ? EMPTY_PLAN : plan
  }

  const base = leavePreview(plan)
  const steps = tasks.map((task, index) => ({
    id: String(index + 1),
    subject: clean(task.content),
    activeForm: task.activeForm ? clean(task.activeForm) : null,
    status: task.status,
  }))
  const continues = base.steps.every(old =>
    steps.some(step => normalize(step.subject) === normalize(old.subject)),
  )
  const isNew = isFinished(base) && !continues && !steps.every(step => step.status === 'completed')

  return { title: isNew ? null : base.title, steps, document: null }
}

/**
 * TaskCreate : une étape de plus, à faire.
 * Créée sur un plan terminé, elle ouvre un nouveau plan (les identifiants peuvent alors repartir de 1).
 */
export function addTask(
  plan: Plan,
  task: { id: string; subject: string; activeForm?: string },
): Plan {
  const step: Step = {
    id: task.id,
    subject: clean(task.subject),
    activeForm: task.activeForm ? clean(task.activeForm) : null,
    status: 'pending',
  }

  if (isHeldByDocument(plan)) {
    return plan
  }

  const base = leavePreview(plan)

  if (isFinished(base)) {
    return { title: null, steps: [step], document: null }
  }

  const exists = base.steps.some(other => other.id === step.id)

  return {
    ...base,
    steps: exists
      ? base.steps.map(other => (other.id === step.id ? step : other))
      : [...base.steps, step],
  }
}

/** TaskUpdate : statut, intitulé ou forme active d'une étape connue ; `deleted` la retire. */
export function updateTask(
  plan: Plan,
  change: { id: string; status?: Status | 'deleted'; subject?: string; activeForm?: string },
): Plan {
  const { id, status, subject, activeForm } = change

  // Les étapes d'un plan Superpowers portent les identifiants du document (« 1 », « F10a ») :
  // celui d'une tâche de la session pourrait coïncider par hasard, et ne les concerne pas.
  if (plan.document !== null) {
    return plan
  }

  if (status === 'deleted') {
    return { ...plan, steps: plan.steps.filter(step => step.id !== id) }
  }

  return {
    ...plan,
    steps: plan.steps.map(step =>
      step.id !== id
        ? step
        : {
            ...step,
            status: status ?? step.status,
            subject: subject ? clean(subject) : step.subject,
            activeForm: activeForm ? clean(activeForm) : step.activeForm,
          },
    ),
  }
}

/**
 * ExitPlanMode accepté : le plan prend ce titre.
 * Un plan déjà terminé, ou un plan Superpowers suivi jusque-là, cède la place au nouveau.
 *
 * Sans outil de tâches natif, les étapes viennent de l'outil du mod, que Claude rappelle pour le
 * nouveau plan : celui-ci repart donc toujours d'une liste vide, plutôt que de montrer les étapes
 * de l'ancien sous son titre.
 */
export function approvePlan(plan: Plan, title: string | null, hasNativeTasks: boolean): Plan {
  return isFinished(plan) || plan.document !== null || !hasNativeTasks
    ? { title, steps: [], document: null }
    : { ...plan, title: title ?? plan.title }
}

/** Titre d'un plan rédigé en Markdown : sa première ligne non vide, sans les marques de titre. */
export function extractTitle(text: string | null | undefined): string | null {
  const line = (text ?? '').split('\n').find(candidate => candidate.trim() !== '')

  if (line === undefined) {
    return null
  }

  const title = clean(line.replace(/^\s*#{1,6}\s+/, '').replace(/[*`]/g, ''))

  return title === '' ? null : title
}

// --- Outil d'étapes ------------------------------------------------------
// Là où la session n'a aucun outil de tâches, le mod offre le sien à Claude. Il prend la liste
// entière des étapes à chaque appel, comme TodoWrite : `replaceTasks` en fait donc la jauge.

function isStatus(value: unknown): value is Status {
  return value === 'pending' || value === 'in_progress' || value === 'completed'
}

/**
 * Lit la liste passée à l'outil d'étapes : les arguments d'un outil de mod arrivent sans type.
 * Renvoie `null` dès qu'une étape n'a pas la forme attendue, plutôt que de deviner le reste.
 */
export function readSteps(input: unknown): Task[] | null {
  if (!Array.isArray(input)) {
    return null
  }

  const tasks: Task[] = []

  for (const item of input) {
    if (typeof item !== 'object' || item === null) {
      return null
    }

    const { content, status, activeForm } = item as Record<string, unknown>

    if (
      typeof content !== 'string' ||
      clean(content) === '' ||
      !isStatus(status) ||
      (activeForm !== undefined && activeForm !== null && typeof activeForm !== 'string')
    ) {
      return null
    }

    // Une forme active nulle ou vide ne dirait rien : l'étape s'affiche alors par son intitulé.
    tasks.push(
      typeof activeForm === 'string' && clean(activeForm) !== ''
        ? { content, status, activeForm }
        : { content, status },
    )
  }

  return tasks
}

/** Ce que l'outil d'étapes répond à Claude : où en est la jauge, ou pourquoi sa liste n'a rien changé. */
export function composeReceipt(plan: Plan): string {
  if (isHeldByDocument(plan)) {
    return 'Liste ignorée : un plan Superpowers tient la jauge, avec son propre avancement.'
  }

  // Seule une liste vide laisse en place l'aperçu d'un plan Superpowers.
  if (plan.document !== null) {
    return "Jauge inchangée : elle montre l'aperçu d'un plan Superpowers, qu'une liste d'étapes remplacera."
  }

  const { total, done } = measure(plan)

  return total === 0 ? 'Jauge effacée.' : `Jauge à jour : ${done}/${total} étapes terminées.`
}

// --- Plans Superpowers ---------------------------------------------------
// Un plan Superpowers est un document Markdown, `docs/superpowers/plans/<nom>.md`, découpé en tâches
// (`### Task 3: …`). Son avancement est consigné à part, dans un registre que l'exécuteur du plan
// complète tâche après tâche : `.superpowers/sdd/<nom>/progress.md`, une ligne
// `Task 3: complete (…)` par tâche close.

/** Une tâche lue dans le document d'un plan. */
export type DocumentTask = {
  /** Identifiant de la tâche tel que le plan l'écrit : `3`, `F10a`, `A2.1`. */
  id: string
  subject: string
  /** Nombre de cases à cocher de la tâche (`- [ ]`), et combien sont cochées. */
  boxes: number
  checked: number
}

/** Ce qu'on retient du document d'un plan : son titre et ses tâches, dans l'ordre. */
export type PlanDocument = { title: string; tasks: DocumentTask[] }

/** Ce qu'on retient d'un registre : les tâches closes, et celles dont il parle sans les clore. */
export type Ledger = { closed: string[]; mentioned: string[] }

/** Ce que la session vient de faire du document d'un plan : le lire (Read), ou l'écrire (Write, Edit). */
export type Access = 'read' | 'write'

/** Chemin du document d'un plan, à l'emplacement par défaut de Superpowers : racine du dépôt, nom du plan. */
const PLAN_PATH = /^(.*)[\\/]docs[\\/]superpowers[\\/]plans[\\/]([^\\/]+)\.md$/i

/** Titre d'une tâche : `### Task 3: Nom`, `## Task F10a : Nom`, `### Tâche 1 — Nom`. */
const TASK_HEADING = /^(#{1,4})\s+(?:Task|T[âa]che)\s+([A-Za-z0-9][\w.]*(?:\s+bis)?)\s*[:—–-]\s*(.+)$/i

/** Ligne d'un registre qui parle d'une tâche, et dit éventuellement qu'elle est close. */
const LEDGER_LINE = /^\s*(?:[-*]\s+)?(?:Task|T[âa]che)\s+([A-Za-z0-9][\w.]*(?:\s+bis)?)\s*:\s*(complete\b)?/i

/** La mention « Implementation Plan » ou « plan d'implémentation » qui suit le nom dans le titre. */
const PLAN_SUFFIX = /\s*[—–:-]?\s*(?:implementation plan|plan d[’']impl[ée]mentation)/i

/** Deux écritures d'un même identifiant (« F10a », « f10a ») ou d'un même chemin doivent se comparer égales. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\\/g, '/').replace(/\s+/g, ' ')
}

/** Vrai pour le chemin d'un document de plan Superpowers. */
export function isPlanDocument(path: string): boolean {
  return PLAN_PATH.test(path)
}

/** Chemin du registre d'un plan, d'après celui de son document ; `null` hors de l'emplacement par défaut. */
export function locateLedger(path: string): string | null {
  const [, root, name] = path.match(PLAN_PATH) ?? []

  return root === undefined || name === undefined
    ? null
    : `${root}/.superpowers/sdd/${name}/progress.md`
}

/**
 * Lit le document d'un plan : son titre (la première ligne) et ses tâches.
 * Renvoie `null` pour un texte absent, sans titre ou sans aucune tâche.
 */
export function parsePlanDocument(text: string | null): PlanDocument | null {
  const lines = (text ?? '').split(/\r?\n/)
  const heading = lines.find(line => line.trim() !== '')?.match(/^#\s+(.+)$/)?.[1]

  if (heading === undefined) {
    return null
  }

  const tasks: DocumentTask[] = []
  let current: DocumentTask | undefined
  let level = 0
  let isInFence = false

  for (const line of lines) {
    // Le code cité par le plan peut contenir des titres et des cases : on le saute.
    if (/^\s*(```|~~~)/.test(line)) {
      isInFence = !isInFence
      continue
    }

    if (isInFence) {
      continue
    }

    const [, hashes = '', id = '', name = ''] = line.match(TASK_HEADING) ?? []

    if (id !== '') {
      const subject = clean(name.replace(/[*`]/g, ''))

      // Un identifiant qui n'est pas un simple numéro (« F10a ») sert de repère : on le garde devant le nom.
      current = { id, subject: /^\d+$/.test(id) ? subject : `${id} — ${subject}`, boxes: 0, checked: 0 }
      tasks.push(current)
      level = hashes.length
      continue
    }

    // Un titre de même rang ou au-dessus (« ## Lot 3 ») referme la tâche : ses cases ne sont plus les siennes.
    const headingLevel = line.match(/^(#{1,6})\s+\S/)?.[1]?.length ?? 0

    if (headingLevel > 0 && headingLevel <= level) {
      current = undefined
      continue
    }

    const mark = line.match(/^\s*[-*]\s+\[([ xX])\]/)?.[1]

    if (mark !== undefined && current !== undefined) {
      current.boxes += 1
      current.checked += mark === ' ' ? 0 : 1
    }
  }

  if (tasks.length === 0) {
    return null
  }

  return {
    title: clean(heading.replace(PLAN_SUFFIX, '').replace(/[*`]/g, '')) || clean(heading),
    tasks,
  }
}

/** Lit un registre : quelles tâches il déclare closes, et de quelles autres il parle. */
export function parseLedger(text: string | null): Ledger | null {
  if (text === null) {
    return null
  }

  const closed = new Set<string>()
  const mentioned = new Set<string>()

  for (const line of text.split(/\r?\n/)) {
    const [, id, completion] = line.match(LEDGER_LINE) ?? []

    if (id !== undefined) {
      const target = completion === undefined ? mentioned : closed

      target.add(normalize(id))
    }
  }

  return { closed: [...closed], mentioned: [...mentioned] }
}

/**
 * Prend pour jauge le plan Superpowers dont la session vient de lire ou d'écrire le document.
 *
 * Une tâche est close quand le registre le dit ou que toutes ses cases sont cochées ; elle est en
 * cours quand le registre en parle sans la clore, ou qu'une partie de ses cases est cochée.
 * Une tâche déjà vue close le reste : l'exécuteur supprime le registre une fois le plan terminé.
 *
 * Pendant un plan de session en cours, une simple lecture ne change rien : lire un document pour
 * s'informer n'est pas en exécuter le plan.
 */
export function trackDocument(
  plan: Plan,
  path: string,
  document: PlanDocument,
  ledger: Ledger | null,
  access: Access,
): Plan {
  const hasRunningTasks = plan.document === null && plan.steps.length > 0 && !isFinished(plan)

  if (hasRunningTasks && access === 'read') {
    return plan
  }

  const previous = plan.document !== null && normalize(plan.document.path) === normalize(path) ? plan : null
  const hasLedger = ledger !== null || previous?.document?.hasLedger === true

  const steps = document.tasks.map((task): Step => {
    const id = normalize(task.id)
    const was = previous?.steps.find(step => normalize(step.id) === id)?.status
    const isClosed =
      was === 'completed' ||
      (task.boxes > 0 && task.checked === task.boxes) ||
      ledger?.closed.includes(id) === true
    const isStarted =
      was === 'in_progress' || task.checked > 0 || ledger?.mentioned.includes(id) === true

    return {
      id: task.id,
      subject: task.subject,
      activeForm: null,
      status: isClosed ? 'completed' : isStarted ? 'in_progress' : 'pending',
    }
  })

  // Des tâches de session sont en cours et le plan Superpowers écrit n'a encore rien consigné :
  // on ne les efface pas, le document se contente de nommer le plan.
  const hasProgress = hasLedger || steps.some(step => step.status !== 'pending')

  if (hasRunningTasks && !hasProgress) {
    return { ...plan, title: document.title }
  }

  return { title: document.title, steps, document: { path, hasLedger } }
}

/**
 * Reporte sur le plan suivi ce que son registre dit maintenant.
 * Renvoie le plan tel quel quand rien n'a bougé, pour ne pas redessiner sans raison.
 */
export function applyLedger(plan: Plan, ledger: Ledger): Plan {
  if (plan.document === null) {
    return plan
  }

  let hasChanged = !plan.document.hasLedger

  const steps = plan.steps.map(step => {
    const id = normalize(step.id)
    const status: Status =
      step.status === 'completed' || ledger.closed.includes(id)
        ? 'completed'
        : step.status === 'in_progress' || ledger.mentioned.includes(id)
          ? 'in_progress'
          : 'pending'

    if (status === step.status) {
      return step
    }

    hasChanged = true

    return { ...step, status }
  })

  return hasChanged ? { ...plan, steps, document: { ...plan.document, hasLedger: true } } : plan
}

// --- Mesure --------------------------------------------------------------

/** Les chiffres du plan : combien d'étapes, faites, en cours, et lesquelles montrer. */
export function measure(plan: Plan) {
  const running = plan.steps.filter(step => step.status === 'in_progress')

  return {
    total: plan.steps.length,
    done: plan.steps.filter(step => step.status === 'completed').length,
    active: running.length,
    current: running[0],
    next: plan.steps.find(step => step.status === 'pending'),
  }
}

// --- Largeur et troncature -----------------------------------------------

/** Plages de caractères sans largeur : combinants, espaces nuls, sélecteurs de variante. */
const ZERO_WIDTH: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x200b, 0x200f],
  [0xfe00, 0xfe0f],
]

/** Plages de caractères qui occupent deux cellules : CJK, hangul, formes pleine largeur, emoji. */
const DOUBLE_WIDTH: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

function charWidth(char: string): number {
  const point = char.codePointAt(0) ?? 0
  const isIn = (ranges: readonly (readonly [number, number])[]) =>
    ranges.some(([start, end]) => point >= start && point <= end)

  if (isIn(ZERO_WIDTH)) {
    return 0
  }

  return isIn(DOUBLE_WIDTH) ? 2 : 1
}

/** Largeur d'un texte en cellules de terminal (et non en caractères). */
export function displayWidth(text: string): number {
  let total = 0

  for (const char of text) {
    total += charWidth(char)
  }

  return total
}

/** Coupe un texte pour qu'il tienne dans `max` cellules, points de suspension compris. */
export function truncate(text: string, max: number): string {
  if (displayWidth(text) <= max) {
    return text
  }

  if (max <= 0) {
    return ''
  }

  let head = ''
  let used = 0

  for (const char of text) {
    const cells = charWidth(char)

    // Une cellule reste réservée aux points de suspension.
    if (used + cells > max - 1) {
      break
    }

    head += char
    used += cells
  }

  return `${head.trimEnd()}…`
}

// --- Bande au-dessus du prompt -------------------------------------------

/** Ce que Claude fait en ce moment, ou à défaut ce qui vient ensuite. */
function describeActivity(measured: ReturnType<typeof measure>): { glyph: string; label: string; tone: Tone } {
  const { current, next, active } = measured

  if (current !== undefined) {
    // Plusieurs étapes en parallèle : on montre la première et on compte les autres.
    const others = active > 1 ? ` (+${active - 1})` : ''

    return {
      glyph: GLYPHS.in_progress,
      label: `${current.activeForm ?? current.subject}${others}`,
      tone: 'active',
    }
  }

  if (next !== undefined) {
    return { glyph: GLYPHS.pending, label: next.subject, tone: 'muted' }
  }

  return { glyph: GLYPHS.completed, label: 'terminé', tone: 'done' }
}

/** Répartit les cases de la barre : faites, en cours, restantes. */
function splitCells(measured: ReturnType<typeof measure>) {
  const { total, done, active } = measured
  const cells = Math.min(total, MAX_CELLS)
  const full = Math.floor((done * cells) / total)
  // Une étape en cours garde au moins une case, même quand la barre est à l'échelle.
  const running =
    active === 0 ? 0 : Math.min(cells - full, Math.max(1, Math.round((active * cells) / total)))

  return { full, running, empty: cells - full - running }
}

/**
 * Compose la bande sur une seule ligne, dans la limite de `columns` cellules :
 * `◆ <titre> · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ <forme active>`.
 *
 * Le numéro d'étape compte les étapes faites et en cours : c'est le nombre de cases pleines.
 * Renvoie `null` quand le plan n'a aucune étape : il n'y a alors rien à montrer.
 */
export function composeBand(plan: Plan, columns: number): Segment[] | null {
  const measured = measure(plan)

  if (measured.total === 0) {
    return null
  }

  const stepLabel = `étape ${measured.done + measured.active}/${measured.total}`
  const { glyph, label, tone } = describeActivity(measured)
  const { full, running, empty } = splitCells(measured)
  const cells = full + running + empty

  // Ce qui reste au titre et au libellé une fois posées les parties fixes de la mise en page choisie.
  const roomFor = (withTitle: boolean, withBar: boolean) =>
    Math.floor(columns) -
    displayWidth(`◆ ${stepLabel}${SEPARATOR}${glyph} `) -
    (withTitle ? SEPARATOR.length : 0) -
    (withBar ? SEPARATOR.length + cells : 0)

  // Bande étroite : on retire d'abord la barre, puis le titre, pour garder la place du libellé.
  const withBar = roomFor(true, true) >= MIN_ROOM
  const withTitle = withBar || roomFor(true, false) >= MIN_ROOM
  const room = Math.max(0, roomFor(withTitle, withBar))

  // Le titre prend ce que le libellé lui laisse, et au moins un tiers de la place.
  const fullTitle = plan.title ?? DEFAULT_TITLE
  const fitsWhole = displayWidth(fullTitle) + displayWidth(label) <= room
  const title = !withTitle
    ? ''
    : fitsWhole
      ? fullTitle
      : truncate(fullTitle, Math.max(Math.floor(room / 3), room - displayWidth(label)))
  const activity = `${glyph} ${truncate(label, room - displayWidth(title))}`.trimEnd()

  const segments: Segment[] = [
    { text: `◆ ${title}`, tone: 'title' },
    { text: withTitle ? SEPARATOR : '', tone: 'muted' },
    { text: stepLabel, tone: 'muted' },
    { text: withBar ? SEPARATOR : '', tone: 'muted' },
    { text: withBar ? '▰'.repeat(full) : '', tone: 'done' },
    { text: withBar ? '▰'.repeat(running) : '', tone: 'active' },
    { text: withBar ? '▱'.repeat(empty) : '', tone: 'muted' },
    { text: SEPARATOR, tone: 'muted' },
    { text: activity, tone },
  ]

  return segments.filter(segment => segment.text !== '')
}

// --- Liste complète ------------------------------------------------------

/** En-tête de la liste : le titre du plan et le compte des étapes faites. */
export function composeHeader(plan: Plan): string {
  const { total, done } = measure(plan)

  return `◆ ${plan.title ?? DEFAULT_TITLE} · ${done}/${total}`
}

/** La liste complète en texte brut, pour les surfaces qui ne placent pas de panneau. */
export function composeList(plan: Plan): string {
  if (plan.steps.length === 0) {
    return 'Aucun plan en cours.'
  }

  return [
    composeHeader(plan),
    ...plan.steps.map(step => `${GLYPHS[step.status]} ${step.subject}`),
  ].join('\n')
}
