// Contrat d'état du mod michi : ce que `$.state` conserve le temps de la session.
// `claude plugin validate` vérifie chaque clé `$.state` nommée par le module contre ce fichier.

/** Statut d'une étape, tel que TodoWrite et TaskUpdate le nomment. */
export type Statut = 'pending' | 'in_progress' | 'completed'

/** Une étape du plan. */
export type Etape = {
  /** Identifiant de la tâche : celui que TaskCreate renvoie, ou le rang dans la liste pour TodoWrite. */
  id: string
  /** Intitulé de l'étape. */
  sujet: string
  /** Forme « en cours » montrée dans la bande ; `null` quand l'outil n'en a pas donné. */
  formeActive: string | null
  statut: Statut
}

/** Le plan de la session principale. */
export type Plan = {
  /** Titre du plan validé par ExitPlanMode ; `null` tant qu'aucun plan n'a été validé. */
  titre: string | null
  etapes: Etape[]
}

declare module 'claude-code' {
  interface PluginState {
    michi: { plan: Plan }
  }
}
