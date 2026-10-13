// Contrat d'état du mod michi : ce que `$.state` conserve le temps de la session.
// `claude plugin validate` vérifie chaque clé `$.state` nommée par le module contre ce fichier.

/** Statut d'une étape, tel que TodoWrite et TaskUpdate le nomment. */
export type Status = 'pending' | 'in_progress' | 'completed'

/** Une étape du plan. */
export type Step = {
  /**
   * Identifiant de la tâche : celui que TaskCreate renvoie, le rang dans la liste pour TodoWrite,
   * ou l'identifiant de la tâche dans un plan Superpowers (`3`, `F10a`, `A2.1`).
   */
  id: string
  /** Intitulé de l'étape. */
  subject: string
  /** Forme « en cours » montrée dans la bande ; `null` quand l'outil n'en a pas donné. */
  activeForm: string | null
  status: Status
}

/** Le plan Superpowers dont la jauge est tirée : son document, et ce qu'on sait de son registre. */
export type TrackedDocument = {
  /** Chemin du document du plan (`docs/superpowers/plans/<nom>.md`). */
  path: string
  /** Vrai dès que le registre d'avancement du plan (`progress.md`) a été trouvé. */
  hasLedger: boolean
}

/** Le plan de la session principale. */
export type Plan = {
  /** Titre du plan : celui validé par ExitPlanMode, ou celui du document Superpowers ; `null` sinon. */
  title: string | null
  steps: Step[]
  /**
   * Le plan Superpowers suivi : les étapes sont alors ses tâches, et non celles de la session.
   * `null` quand les étapes viennent des tâches de la session (TodoWrite, TaskCreate, TaskUpdate).
   */
  document: TrackedDocument | null
}

declare module 'claude-code' {
  interface PluginState {
    michi: { plan: Plan }
  }
}
