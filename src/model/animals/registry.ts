import type { AnimalBuilder, AvatarSlug } from './types'
import { buildBear } from './bear'
import { buildMonkey } from './monkey'
import { buildTurtle } from './turtle'

export type { AvatarSlug } from './types'

export const AVATAR_LABELS: Readonly<Record<AvatarSlug, string>> = {
  bear: '곰',
  monkey: '원숭이',
  turtle: '거북이',
}

const BUILDERS: Readonly<Record<AvatarSlug, AnimalBuilder>> = {
  bear: buildBear,
  monkey: buildMonkey,
  turtle: buildTurtle,
}

export function isAvatarSlug(value: unknown): value is AvatarSlug {
  return typeof value === 'string' && value in BUILDERS
}

export function animalBuilder(slug: AvatarSlug): AnimalBuilder {
  return BUILDERS[slug]
}

