import catalogJson from '../../../shared/avatar-catalog.json'
import type { AnimalBuilder, AvatarSlug } from './types'
import { buildSpeciesCosplay, SPECIES_HEADS } from './cosplay'
import { buildHairStyle, type HairStyle } from './hair'
import { buildWardrobe, type WardrobeStyle } from './wardrobe'

export type { AvatarSlug } from './types'

interface CatalogColor3 {
  dark: string
  mid: string
  light: string
}

interface CatalogHair {
  base: string
  shade: string
  accent: string
}

interface CatalogPalette {
  primary: string
  shade: string
  secondary: string
  accent: string
  dark: string
}

export interface AvatarDefinition {
  slug: AvatarSlug
  label: string
  key: string
  modelUrl: string
  /** Expression weight, calibrated from the catalog's 0..1 art-direction score. */
  eyeSharpen: number
  hairStyle: HairStyle
  outfitStyle: WardrobeStyle
  skinTone: string
  iris: CatalogColor3
  hair: CatalogHair
  palette: CatalogPalette
  hiddenMaterials: readonly string[]
}

const SLUGS = [
  'bear',
  'monkey',
  'turtle',
  'rabbit',
  'fox',
  'panda',
  'penguin',
  'owl',
  'lion',
  'tiger',
  'elephant',
  'giraffe',
] as const satisfies readonly AvatarSlug[]

const SLUG_SET = new Set<string>(SLUGS)

const HAIR_BY_SLUG: Readonly<Record<AvatarSlug, HairStyle>> = {
  bear: 'wavyBob',
  monkey: 'highPony',
  turtle: 'bluntBob',
  rabbit: 'twinTails',
  fox: 'wolfCut',
  panda: 'doubleBuns',
  penguin: 'pixieBob',
  owl: 'braidedCrown',
  lion: 'curlyShag',
  tiger: 'braidedHighPony',
  elephant: 'lowPony',
  giraffe: 'bubblePony',
}

const OUTFIT_BY_SLUG: Readonly<Record<AvatarSlug, WardrobeStyle>> = {
  bear: 'varsitySkort',
  monkey: 'bomberCargo',
  turtle: 'techUtility',
  rabbit: 'cardiganSkort',
  fox: 'motoLeggings',
  panda: 'pandaCulottes',
  penguin: 'sailorCulottes',
  owl: 'scholarTrousers',
  lion: 'royalWideLeg',
  tiger: 'racerLayered',
  elephant: 'utilityCoat',
  giraffe: 'safariShorts',
}

const BASE_HIDDEN_MATERIALS = [
  // The generated wardrobes fully replace the donor school topology.
  'tops_01_cloth',
  'bottoms_01_cloth',
  'shoes_01_cloth',
  'accessoryneck',
  // Procedural hair provides twelve independent silhouettes.
  'hairback_00_hair',
  'hair_00_hair_01',
  'hair_00_hair_02',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value) throw new Error(`[avatars] catalog ${key} must be a non-empty string`)
  return value
}

function parseColorObject(value: unknown, keys: readonly string[]): Record<string, string> {
  if (!isRecord(value)) throw new Error('[avatars] catalog color group must be an object')
  const result: Record<string, string> = {}
  for (const key of keys) {
    const color = requiredString(value, key)
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`[avatars] invalid color ${color}`)
    result[key] = color
  }
  return result
}

function asNumberColor(color: string): number {
  return Number.parseInt(color.slice(1), 16)
}

function shadeColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor)
  const g = Math.round(((color >> 8) & 0xff) * factor)
  const b = Math.round((color & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}

function parseCatalog(raw: unknown): AvatarDefinition[] {
  if (!Array.isArray(raw)) throw new Error('[avatars] shared/avatar-catalog.json must be an array')
  if (raw.length !== SLUGS.length) throw new Error(`[avatars] expected ${SLUGS.length} catalog entries, got ${raw.length}`)

  const seenSlugs = new Set<string>()
  const seenKeys = new Set<string>()
  const result = raw.map((value) => {
    if (!isRecord(value)) throw new Error('[avatars] catalog entry must be an object')
    const rawSlug = requiredString(value, 'slug')
    if (!SLUG_SET.has(rawSlug)) throw new Error(`[avatars] unknown slug ${rawSlug}`)
    const slug = rawSlug as AvatarSlug
    const key = requiredString(value, 'key')
    if (seenSlugs.has(slug) || seenKeys.has(key)) throw new Error(`[avatars] duplicate slug/key ${slug}/${key}`)
    seenSlugs.add(slug)
    seenKeys.add(key)

    const iris = parseColorObject(value.iris, ['dark', 'mid', 'light']) as unknown as CatalogColor3
    const hair = parseColorObject(value.hair, ['base', 'shade', 'accent']) as unknown as CatalogHair
    const palette = parseColorObject(
      value.palette,
      ['primary', 'shade', 'secondary', 'accent', 'dark'],
    ) as unknown as CatalogPalette
    const sharpnessScore = typeof value.eyeSharpen === 'number' ? value.eyeSharpen : 0.6
    const catalogHidden = Array.isArray(value.hiddenMaterials)
      ? value.hiddenMaterials.filter((item): item is string => typeof item === 'string')
      : []

    return {
      slug,
      label: requiredString(value, 'label'),
      key,
      modelUrl: requiredString(value, 'modelUrl'),
      // Fable5's proven safe expression range was roughly 0.08..0.20.  The
      // catalog value is an art-direction score, not a raw VRM expression.
      eyeSharpen: THREEClamp(sharpnessScore * 0.22, 0.06, 0.20),
      hairStyle: HAIR_BY_SLUG[slug],
      outfitStyle: OUTFIT_BY_SLUG[slug],
      skinTone: requiredString(value, 'skinTone'),
      iris,
      hair,
      palette,
      hiddenMaterials: [...new Set([...BASE_HIDDEN_MATERIALS, ...catalogHidden.map((x) => x.toLowerCase())])],
    }
  })

  for (const slug of SLUGS) {
    if (!seenSlugs.has(slug)) throw new Error(`[avatars] missing catalog entry ${slug}`)
  }
  return result
}

function THREEClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const AVATAR_CATALOG: readonly AvatarDefinition[] = parseCatalog(catalogJson)

export const AVATAR_LABELS: Readonly<Record<AvatarSlug, string>> = Object.freeze(
  Object.fromEntries(AVATAR_CATALOG.map((entry) => [entry.slug, entry.label])),
) as Readonly<Record<AvatarSlug, string>>

export const AVATAR_KEYS: Readonly<Record<string, AvatarSlug>> = Object.freeze(
  Object.fromEntries(AVATAR_CATALOG.map((entry) => [entry.key, entry.slug])),
)

const DEFINITIONS: Readonly<Record<AvatarSlug, AvatarDefinition>> = Object.freeze(
  Object.fromEntries(AVATAR_CATALOG.map((entry) => [entry.slug, entry])),
) as Readonly<Record<AvatarSlug, AvatarDefinition>>

function makeBuilder(definition: AvatarDefinition): AnimalBuilder {
  return (context) => {
    const rig = buildSpeciesCosplay(context, SPECIES_HEADS[definition.slug])
    const hairRig = buildHairStyle(
      rig.headFollow,
      context,
      {
        style: definition.hairStyle,
        base: asNumberColor(definition.hair.base),
        shade: asNumberColor(definition.hair.shade),
        accent: asNumberColor(definition.hair.accent),
      },
      rig.hitMeshes,
    )
    const primary = asNumberColor(definition.palette.primary)
    const secondary = asNumberColor(definition.palette.secondary)
    buildWardrobe(
      context,
      {
        style: definition.outfitStyle,
        palette: {
          primary,
          primaryShade: asNumberColor(definition.palette.shade),
          secondary,
          secondaryShade: shadeColor(secondary, 0.78),
          accent: asNumberColor(definition.palette.accent),
          dark: asNumberColor(definition.palette.dark),
          light: asNumberColor(definition.iris.light),
        },
      },
      rig.hitMeshes,
    )

    const updateSpecies = rig.update
    let elapsed = 0
    rig.update = (pitchS, yaw, breath, dt) => {
      updateSpecies?.(pitchS, yaw, breath, dt)
      elapsed += THREEClamp(dt, 0, 0.05)
      hairRig.secondary.forEach((part, index) => {
        const phase = index * 0.73
        part.rotation.x = -pitchS * (0.07 + index * 0.008)
        part.rotation.z =
          -yaw * (0.08 + index * 0.006) +
          Math.sin(elapsed * (2.2 + index * 0.08) + phase) * 0.025 +
          breath * 0.008
      })
    }
    return rig
  }
}

const BUILDERS: Readonly<Record<AvatarSlug, AnimalBuilder>> = Object.freeze(
  Object.fromEntries(AVATAR_CATALOG.map((entry) => [entry.slug, makeBuilder(entry)])),
) as Readonly<Record<AvatarSlug, AnimalBuilder>>

export function isAvatarSlug(value: unknown): value is AvatarSlug {
  return typeof value === 'string' && SLUG_SET.has(value)
}

export function avatarDefinition(slug: AvatarSlug): AvatarDefinition {
  return DEFINITIONS[slug]
}

export function animalBuilder(slug: AvatarSlug): AnimalBuilder {
  return BUILDERS[slug]
}
