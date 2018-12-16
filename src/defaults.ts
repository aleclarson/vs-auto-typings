import { workspace } from 'vscode'

type Defaults = typeof defaults
type Default = keyof Defaults & string
type Out<T> = T extends (...args: any[]) => infer U ? U : never

const defaults = {
  bin: (): string => get('bin') || 'npm',
  dev: () => !!get('dev'),
  skipDev: () => !!get('skipDev'),
}

/** Get a user-configured default value */
export function getDefault<K extends Default>(key: K): Out<Defaults[K]> {
  return defaults[key]() as any
}

// Configuration getter
function get(key: string): any {
  return workspace.getConfiguration('typings').get(key)
}
