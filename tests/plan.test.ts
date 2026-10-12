import { describe, expect, test } from 'claude-code/testing'

import type { Plan, Statut } from '../types'
import {
  PLAN_VIDE,
  ajouterTache,
  composerBande,
  composerListe,
  extraireTitre,
  largeur,
  modifierTache,
  remplacerTaches,
  tronquer,
  validerPlan,
} from '../hooks/plan'

// Tests de la logique pure : aucune session, aucun moteur.

/** Fabrique un plan dont les étapes portent les statuts donnés, dans l'ordre. */
function planDe(statuts: Statut[], titre: string | null = null): Plan {
  return {
    titre,
    etapes: statuts.map((statut, rang) => ({
      id: String(rang + 1),
      sujet: `Étape ${rang + 1}`,
      formeActive: `Réalisation de l'étape ${rang + 1}`,
      statut,
    })),
  }
}

/** Le texte de la bande, tous morceaux réunis. */
function ligne(plan: Plan, colonnes: number): string | null {
  return composerBande(plan, colonnes)?.map(segment => segment.texte).join('') ?? null
}

describe('transitions', () => {
  test('TaskCreate ajoute une étape à faire', () => {
    const plan = ajouterTache(PLAN_VIDE, { id: '1', sujet: 'Écrire le parseur' })

    expect(plan.etapes).toEqual([
      { id: '1', sujet: 'Écrire le parseur', formeActive: null, statut: 'pending' },
    ])
  })

  test('TaskUpdate change le statut de la bonne étape', () => {
    const plan = modifierTache(planDe(['pending', 'pending']), { id: '2', statut: 'in_progress' })

    expect(plan.etapes.map(etape => etape.statut)).toEqual(['pending', 'in_progress'])
  })

  test('TaskUpdate sur une étape inconnue ne change rien', () => {
    const avant = planDe(['pending'])

    expect(modifierTache(avant, { id: '42', statut: 'completed' })).toEqual(avant)
  })

  test('TaskUpdate « deleted » retire l’étape', () => {
    const plan = modifierTache(planDe(['completed', 'pending']), { id: '2', statut: 'deleted' })

    expect(plan.etapes.map(etape => etape.id)).toEqual(['1'])
  })

  test('une tâche créée sur un plan terminé ouvre un nouveau plan sans l’ancien titre', () => {
    const termine = planDe(['completed', 'completed'], 'Ancien plan')
    const plan = ajouterTache(termine, { id: '1', sujet: 'Repartir' })

    expect(plan).toEqual({
      titre: null,
      etapes: [{ id: '1', sujet: 'Repartir', formeActive: null, statut: 'pending' }],
    })
  })

  test('TodoWrite remplace toute la liste, et une liste vide efface le plan', () => {
    const plan = remplacerTaches(planDe(['pending'], 'Titre'), [
      { content: 'A', status: 'completed', activeForm: 'Fait A' },
      { content: 'B', status: 'in_progress', activeForm: 'Fait B' },
    ])

    expect(plan.titre).toBe('Titre')
    expect(plan.etapes.map(etape => [etape.sujet, etape.statut])).toEqual([
      ['A', 'completed'],
      ['B', 'in_progress'],
    ])
    expect(remplacerTaches(plan, [])).toEqual(PLAN_VIDE)
  })

  test('ExitPlanMode donne son titre au plan et efface un plan terminé', () => {
    expect(validerPlan(planDe(['pending']), 'Nouveau')).toMatchObject({ titre: 'Nouveau' })
    expect(validerPlan(planDe(['pending']), 'Nouveau').etapes).toHaveLength(1)
    expect(validerPlan(planDe(['completed'], 'Ancien'), 'Nouveau')).toEqual({
      titre: 'Nouveau',
      etapes: [],
    })
  })

  test('le titre est la première ligne non vide du plan, sans marques Markdown', () => {
    expect(extraireTitre('\n\n# Migrer `auth` vers **OIDC**\n\n## Étapes\n- a')).toBe(
      'Migrer auth vers OIDC',
    )
    expect(extraireTitre('Simple ligne\nsuite')).toBe('Simple ligne')
    expect(extraireTitre('   \n')).toBeNull()
    expect(extraireTitre(null)).toBeNull()
  })
})

describe('bande', () => {
  test('rien à composer sans étape', () => {
    expect(composerBande(PLAN_VIDE, 80)).toBeNull()
    expect(composerBande({ titre: 'Validé mais sans étape', etapes: [] }, 80)).toBeNull()
  })

  test('suit le format attendu : titre, étape, barre, activité', () => {
    const plan = planDe(
      ['completed', 'completed', 'in_progress', 'pending', 'pending', 'pending', 'pending'],
      'Refonte',
    )

    expect(ligne(plan, 80)).toBe('◆ Refonte · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ Réalisation de l\'étape 3')
  })

  test('entre deux étapes, annonce la suivante ; à la fin, « terminé »', () => {
    expect(ligne(planDe(['completed', 'pending', 'pending']), 80)).toBe(
      '◆ Plan · étape 1/3 · ▰▱▱ · ○ Étape 2',
    )
    expect(ligne(planDe(['completed', 'completed']), 80)).toBe('◆ Plan · étape 2/2 · ▰▰ · ✔ terminé')
  })

  test('compte les étapes menées en parallèle', () => {
    expect(ligne(planDe(['in_progress', 'in_progress', 'pending']), 80)).toBe(
      '◆ Plan · étape 2/3 · ▰▰▱ · ▶ Réalisation de l\'étape 1 (+1)',
    )
  })

  test('ramène la barre à dix cases pour un long plan', () => {
    const statuts: Statut[] = Array.from({ length: 40 }, (_, rang) =>
      rang < 20 ? 'completed' : rang === 20 ? 'in_progress' : 'pending',
    )

    expect(ligne(planDe(statuts), 120)).toContain(' · étape 21/40 · ▰▰▰▰▰▰▱▱▱▱ · ')
  })

  test('ne dépasse jamais la largeur donnée, quitte à couper le libellé', () => {
    const plan: Plan = {
      titre: 'Un titre de plan vraiment très long qui ne tiendra pas dans la bande',
      etapes: [
        {
          id: '1',
          sujet: 'x',
          formeActive: 'Une forme active interminable qui déborde largement de la place disponible',
          statut: 'in_progress',
        },
        { id: '2', sujet: 'y', formeActive: null, statut: 'pending' },
      ],
    }

    for (const colonnes of [120, 80, 60, 40, 30, 20]) {
      const texte = ligne(plan, colonnes) ?? ''

      expect(largeur(texte), `à ${colonnes} colonnes : ${texte}`).toBeLessThanOrEqual(colonnes)
      expect(texte).toContain('▶')
    }

    expect(ligne(plan, 60)).toContain('…')
  })
})

describe('largeur et troncature', () => {
  test('compte en cellules : deux pour le CJK et les emoji, zéro pour un combinant', () => {
    expect(largeur('abc')).toBe(3)
    expect(largeur('日本語')).toBe(6)
    expect(largeur('🚀')).toBe(2)
    expect(largeur('é')).toBe(1)
  })

  test('coupe à la largeur, points de suspension compris', () => {
    expect(tronquer('court', 10)).toBe('court')
    expect(tronquer('Écriture du parseur', 10)).toBe('Écriture…')
    expect(largeur(tronquer('日本語のテキスト', 7))).toBeLessThanOrEqual(7)
    expect(tronquer('abc', 0)).toBe('')
  })
})

describe('liste', () => {
  test('une ligne par étape, sous l’en-tête', () => {
    expect(composerListe(planDe(['completed', 'in_progress', 'pending'], 'Refonte'))).toBe(
      ['◆ Refonte · 1/3', '✔ Étape 1', '▶ Étape 2', '○ Étape 3'].join('\n'),
    )
    expect(composerListe(PLAN_VIDE)).toBe('Aucun plan en cours.')
  })
})
