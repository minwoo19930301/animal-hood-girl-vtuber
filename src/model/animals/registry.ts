/**
 * 아바타 레지스트리 (Pack v3) — shared/avatar-catalog.json이 단일 소스.
 * 팩 크기는 카탈로그 길이 기준 (12 하드코딩 금지): AvatarSlug 유니온의 모든
 * 슬러그가 카탈로그에 정확히 1회씩 나타나야 한다. 미지의 추가 필드
 * (authored, outfit 등 파이프라인 소유 필드)는 무시하고 통과시킨다.
 *
 * 빌더는 종별 후드 모듈 13개 (12종 = hoodKit 베이스 스텁, flamingo = hood.ts 래핑).
 * hiddenMaterials는 카탈로그 값만 사용 — BASE_HIDDEN_MATERIALS 폐지. 진짜 VRoid
 * 옷·헤어 메시를 살리고(스킨 웨이팅 메시 > 본 부착 강체), 팔레트 리페인트된
 * 보타이(AccessoryNeck)도 이제 보여준다 (플라밍고만 카탈로그로 숨김).
 */
import catalogJson from '../../../shared/avatar-catalog.json'
import type { AnimalBuilder, AvatarSlug } from './types'
import { buildBear } from './bear'
import { buildMonkey } from './monkey'
import { buildTurtle } from './turtle'
import { buildRabbit } from './rabbit'
import { buildFox } from './fox'
import { buildPanda } from './panda'
import { buildPenguin } from './penguin'
import { buildOwl } from './owl'
import { buildLion } from './lion'
import { buildTiger } from './tiger'
import { buildElephant } from './elephant'
import { buildGiraffe } from './giraffe'
import { buildFlamingo } from './flamingo'

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
  /** 서술 문자열 (아트 디렉션 기록) — 런타임은 소비하지 않는다 */
  hairStyle: string
  outfitStyle: string
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
  'flamingo',
] as const satisfies readonly AvatarSlug[]

const SLUG_SET = new Set<string>(SLUGS)

const BUILDERS: Readonly<Record<AvatarSlug, AnimalBuilder>> = Object.freeze({
  bear: buildBear,
  monkey: buildMonkey,
  turtle: buildTurtle,
  rabbit: buildRabbit,
  fox: buildFox,
  panda: buildPanda,
  penguin: buildPenguin,
  owl: buildOwl,
  lion: buildLion,
  tiger: buildTiger,
  elephant: buildElephant,
  giraffe: buildGiraffe,
  flamingo: buildFlamingo,
})

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseCatalog(raw: unknown): AvatarDefinition[] {
  if (!Array.isArray(raw)) throw new Error('[avatars] shared/avatar-catalog.json must be an array')

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
    const hiddenMaterials = Array.isArray(value.hiddenMaterials)
      ? value.hiddenMaterials.filter((item): item is string => typeof item === 'string')
      : []

    // 그 외 필드(authored, outfit 등)는 빌드/audit 파이프라인 소유 — 여기서는 무시.
    return {
      slug,
      label: requiredString(value, 'label'),
      key,
      modelUrl: requiredString(value, 'modelUrl'),
      // Fable5's proven safe expression range was roughly 0.08..0.20.  The
      // catalog value is an art-direction score, not a raw VRM expression.
      eyeSharpen: clamp(sharpnessScore * 0.22, 0.06, 0.20),
      hairStyle: requiredString(value, 'hairStyle'),
      outfitStyle: requiredString(value, 'outfitStyle'),
      skinTone: requiredString(value, 'skinTone'),
      iris,
      hair,
      palette,
      hiddenMaterials,
    }
  })

  // 완전성: 유니온의 모든 슬러그가 존재 (중복은 위에서 차단 → 길이도 자동 일치)
  for (const slug of SLUGS) {
    if (!seenSlugs.has(slug)) throw new Error(`[avatars] missing catalog entry ${slug}`)
  }
  return result
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

export function isAvatarSlug(value: unknown): value is AvatarSlug {
  return typeof value === 'string' && SLUG_SET.has(value)
}

export function avatarDefinition(slug: AvatarSlug): AvatarDefinition {
  return DEFINITIONS[slug]
}

export function animalBuilder(slug: AvatarSlug): AnimalBuilder {
  return BUILDERS[slug]
}
