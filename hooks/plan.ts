import type { Etape, Plan, Statut } from '../types'

// Logique pure du mod : transitions du plan et mise en forme de la bande.
// Aucun appel au moteur ici, pour que tout se teste sans session.

/** Plan vide : valeur initiale de l'état, et valeur après /clear, /resume ou /branch. */
export const PLAN_VIDE: Plan = { titre: null, etapes: [] }

/** Titre affiché tant qu'aucun plan n'a été validé par ExitPlanMode. */
export const TITRE_PAR_DEFAUT = 'Plan'

/** Glyphe de chaque statut, dans la bande comme dans le panneau. */
export const GLYPHES: Record<Statut, string> = {
  completed: '✔',
  in_progress: '▶',
  pending: '○',
}

/** Rôle d'un morceau de la bande ; le module de hooks en déduit le style. */
export type Ton = 'titre' | 'discret' | 'fait' | 'actif'

/** Un morceau de la bande : son texte et son rôle. */
export type Segment = { texte: string; ton: Ton }

/** Nombre maximal de cases de la barre ; au-delà, les étapes sont ramenées à cette échelle. */
const CASES_MAX = 10

/** Place minimale à laisser au titre et au libellé ; en dessous, on retire la barre, puis le titre. */
const PLACE_MIN = 16

const SEPARATEUR = ' · '

// --- Transitions du plan -------------------------------------------------

/** Ramène un libellé sur une seule ligne : un retour à la ligne casserait la bande. */
function nettoyer(texte: string): string {
  return texte.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim()
}

/** Vrai quand le plan a des étapes et qu'elles sont toutes terminées. */
function estTermine(plan: Plan): boolean {
  return plan.etapes.length > 0 && plan.etapes.every(etape => etape.statut === 'completed')
}

/**
 * TodoWrite : la liste entière est remplacée.
 * Une liste neuve écrite sur un plan terminé ouvre un nouveau plan, qui ne garde pas l'ancien titre.
 */
export function remplacerTaches(
  plan: Plan,
  taches: readonly { content: string; status: Statut; activeForm?: string }[],
): Plan {
  if (taches.length === 0) {
    return PLAN_VIDE
  }

  const etapes = taches.map((tache, rang) => ({
    id: String(rang + 1),
    sujet: nettoyer(tache.content),
    formeActive: tache.activeForm ? nettoyer(tache.activeForm) : null,
    statut: tache.status,
  }))
  const estNouveau = estTermine(plan) && !etapes.every(etape => etape.statut === 'completed')

  return { titre: estNouveau ? null : plan.titre, etapes }
}

/**
 * TaskCreate : une étape de plus, à faire.
 * Créée sur un plan terminé, elle ouvre un nouveau plan (les identifiants peuvent alors repartir de 1).
 */
export function ajouterTache(
  plan: Plan,
  tache: { id: string; sujet: string; formeActive?: string },
): Plan {
  const etape: Etape = {
    id: tache.id,
    sujet: nettoyer(tache.sujet),
    formeActive: tache.formeActive ? nettoyer(tache.formeActive) : null,
    statut: 'pending',
  }

  if (estTermine(plan)) {
    return { titre: null, etapes: [etape] }
  }

  const existe = plan.etapes.some(autre => autre.id === etape.id)

  return {
    ...plan,
    etapes: existe
      ? plan.etapes.map(autre => (autre.id === etape.id ? etape : autre))
      : [...plan.etapes, etape],
  }
}

/** TaskUpdate : statut, intitulé ou forme active d'une étape connue ; `deleted` la retire. */
export function modifierTache(
  plan: Plan,
  modif: { id: string; statut?: Statut | 'deleted'; sujet?: string; formeActive?: string },
): Plan {
  const { id, statut, sujet, formeActive } = modif

  if (statut === 'deleted') {
    return { ...plan, etapes: plan.etapes.filter(etape => etape.id !== id) }
  }

  return {
    ...plan,
    etapes: plan.etapes.map(etape =>
      etape.id !== id
        ? etape
        : {
            ...etape,
            statut: statut ?? etape.statut,
            sujet: sujet ? nettoyer(sujet) : etape.sujet,
            formeActive: formeActive ? nettoyer(formeActive) : etape.formeActive,
          },
    ),
  }
}

/** ExitPlanMode accepté : le plan prend ce titre ; un plan déjà terminé cède la place au nouveau. */
export function validerPlan(plan: Plan, titre: string | null): Plan {
  return estTermine(plan)
    ? { titre, etapes: [] }
    : { titre: titre ?? plan.titre, etapes: plan.etapes }
}

/** Titre d'un plan rédigé en Markdown : sa première ligne non vide, sans les marques de titre. */
export function extraireTitre(texte: string | null | undefined): string | null {
  const ligne = (texte ?? '').split('\n').find(candidate => candidate.trim() !== '')

  if (ligne === undefined) {
    return null
  }

  const titre = nettoyer(ligne.replace(/^\s*#{1,6}\s+/, '').replace(/[*`]/g, ''))

  return titre === '' ? null : titre
}

// --- Mesure --------------------------------------------------------------

/** Les chiffres du plan : combien d'étapes, faites, en cours, et lesquelles montrer. */
export function mesurer(plan: Plan) {
  const enCours = plan.etapes.filter(etape => etape.statut === 'in_progress')

  return {
    total: plan.etapes.length,
    faites: plan.etapes.filter(etape => etape.statut === 'completed').length,
    actives: enCours.length,
    courante: enCours[0],
    suivante: plan.etapes.find(etape => etape.statut === 'pending'),
  }
}

// --- Largeur et troncature -----------------------------------------------

/** Plages de caractères sans largeur : combinants, espaces nuls, sélecteurs de variante. */
const SANS_LARGEUR: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f],
  [0x200b, 0x200f],
  [0xfe00, 0xfe0f],
]

/** Plages de caractères qui occupent deux cellules : CJK, hangul, formes pleine largeur, emoji. */
const DOUBLE_LARGEUR: readonly (readonly [number, number])[] = [
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

function largeurCaractere(caractere: string): number {
  const point = caractere.codePointAt(0) ?? 0
  const estDans = (plages: readonly (readonly [number, number])[]) =>
    plages.some(([debut, fin]) => point >= debut && point <= fin)

  if (estDans(SANS_LARGEUR)) {
    return 0
  }

  return estDans(DOUBLE_LARGEUR) ? 2 : 1
}

/** Largeur d'un texte en cellules de terminal (et non en caractères). */
export function largeur(texte: string): number {
  let total = 0

  for (const caractere of texte) {
    total += largeurCaractere(caractere)
  }

  return total
}

/** Coupe un texte pour qu'il tienne dans `max` cellules, points de suspension compris. */
export function tronquer(texte: string, max: number): string {
  if (largeur(texte) <= max) {
    return texte
  }

  if (max <= 0) {
    return ''
  }

  let debut = ''
  let occupe = 0

  for (const caractere of texte) {
    const pas = largeurCaractere(caractere)

    // Une cellule reste réservée aux points de suspension.
    if (occupe + pas > max - 1) {
      break
    }

    debut += caractere
    occupe += pas
  }

  return `${debut.trimEnd()}…`
}

// --- Bande au-dessus du prompt -------------------------------------------

/** Ce que Claude fait en ce moment, ou à défaut ce qui vient ensuite. */
function decrireActivite(mesure: ReturnType<typeof mesurer>): { glyphe: string; libelle: string; ton: Ton } {
  const { courante, suivante, actives } = mesure

  if (courante !== undefined) {
    // Plusieurs étapes en parallèle : on montre la première et on compte les autres.
    const autres = actives > 1 ? ` (+${actives - 1})` : ''

    return {
      glyphe: GLYPHES.in_progress,
      libelle: `${courante.formeActive ?? courante.sujet}${autres}`,
      ton: 'actif',
    }
  }

  if (suivante !== undefined) {
    return { glyphe: GLYPHES.pending, libelle: suivante.sujet, ton: 'discret' }
  }

  return { glyphe: GLYPHES.completed, libelle: 'terminé', ton: 'fait' }
}

/** Répartit les cases de la barre : faites, en cours, restantes. */
function repartirCases(mesure: ReturnType<typeof mesurer>) {
  const { total, faites, actives } = mesure
  const cases = Math.min(total, CASES_MAX)
  const pleines = Math.floor((faites * cases) / total)
  // Une étape en cours garde au moins une case, même quand la barre est à l'échelle.
  const enCours =
    actives === 0 ? 0 : Math.min(cases - pleines, Math.max(1, Math.round((actives * cases) / total)))

  return { pleines, enCours, vides: cases - pleines - enCours }
}

/**
 * Compose la bande sur une seule ligne, dans la limite de `colonnes` cellules :
 * `◆ <titre> · étape 3/7 · ▰▰▰▱▱▱▱ · ▶ <forme active>`.
 *
 * Le numéro d'étape compte les étapes faites et en cours : c'est le nombre de cases pleines.
 * Renvoie `null` quand le plan n'a aucune étape : il n'y a alors rien à montrer.
 */
export function composerBande(plan: Plan, colonnes: number): Segment[] | null {
  const mesure = mesurer(plan)

  if (mesure.total === 0) {
    return null
  }

  const etape = `étape ${mesure.faites + mesure.actives}/${mesure.total}`
  const { glyphe, libelle, ton } = decrireActivite(mesure)
  const { pleines, enCours, vides } = repartirCases(mesure)
  const cases = pleines + enCours + vides

  // Ce qui reste au titre et au libellé une fois posées les parties fixes de la mise en page choisie.
  const mesurerPlace = (avecTitre: boolean, avecBarre: boolean) =>
    Math.floor(colonnes) -
    largeur(`◆ ${etape}${SEPARATEUR}${glyphe} `) -
    (avecTitre ? SEPARATEUR.length : 0) -
    (avecBarre ? SEPARATEUR.length + cases : 0)

  // Bande étroite : on retire d'abord la barre, puis le titre, pour garder la place du libellé.
  const avecBarre = mesurerPlace(true, true) >= PLACE_MIN
  const avecTitre = avecBarre || mesurerPlace(true, false) >= PLACE_MIN
  const place = Math.max(0, mesurerPlace(avecTitre, avecBarre))

  // Le titre prend ce que le libellé lui laisse, et au moins un tiers de la place.
  const titreEntier = plan.titre ?? TITRE_PAR_DEFAUT
  const tientEntier = largeur(titreEntier) + largeur(libelle) <= place
  const titre = !avecTitre
    ? ''
    : tientEntier
      ? titreEntier
      : tronquer(titreEntier, Math.max(Math.floor(place / 3), place - largeur(libelle)))
  const activite = `${glyphe} ${tronquer(libelle, place - largeur(titre))}`.trimEnd()

  const segments: Segment[] = [
    { texte: `◆ ${titre}`, ton: 'titre' },
    { texte: avecTitre ? SEPARATEUR : '', ton: 'discret' },
    { texte: etape, ton: 'discret' },
    { texte: avecBarre ? SEPARATEUR : '', ton: 'discret' },
    { texte: avecBarre ? '▰'.repeat(pleines) : '', ton: 'fait' },
    { texte: avecBarre ? '▰'.repeat(enCours) : '', ton: 'actif' },
    { texte: avecBarre ? '▱'.repeat(vides) : '', ton: 'discret' },
    { texte: SEPARATEUR, ton: 'discret' },
    { texte: activite, ton },
  ]

  return segments.filter(segment => segment.texte !== '')
}

// --- Liste complète ------------------------------------------------------

/** En-tête de la liste : le titre du plan et le compte des étapes faites. */
export function composerEnTete(plan: Plan): string {
  const { total, faites } = mesurer(plan)

  return `◆ ${plan.titre ?? TITRE_PAR_DEFAUT} · ${faites}/${total}`
}

/** La liste complète en texte brut, pour les surfaces qui ne placent pas de panneau. */
export function composerListe(plan: Plan): string {
  if (plan.etapes.length === 0) {
    return 'Aucun plan en cours.'
  }

  return [
    composerEnTete(plan),
    ...plan.etapes.map(etape => `${GLYPHES[etape.statut]} ${etape.sujet}`),
  ].join('\n')
}
