import { EventEmitter as EE } from 'ee-ts'
import { join } from 'path'
import { exists } from 'saxon/sync'
import { Disposable, RelativePattern, Uri, workspace } from 'vscode'
import { watch, Watcher, WatchEvents } from './watcher'

const noop = () => {}
const dispose = (sub: Disposable) => sub.dispose()

type StringMap = { [name: string]: string }

interface PackageEvents {
  engine(name: string, version: string | null): void
  dependency(name: string, version: string | null, dev: boolean): void
}

export class Package extends EE<PackageEvents> {
  root: string
  engines: StringMap
  dependencies: StringMap
  devDependencies: StringMap
  peerDependencies: StringMap
  subs: Disposable[]

  private _watcher?: Watcher

  constructor(root: string) {
    super()
    this.root = root
    this.engines = {}
    this.dependencies = {}
    this.devDependencies = {}
    this.peerDependencies = {}
    this.subs = []
  }

  /** True if watching the "package.json" of this package */
  get isWatched() {
    return this._watcher != null
  }

  /** Create a URI for a file path in this package */
  uri(...parts: string[]) {
    return Uri.file(join(this.root, ...parts))
  }

  /** True if we have a workspace folder */
  exists(...parts: string[]) {
    return this._ws != null && exists(join(this.root, ...parts))
  }

  /** Get the version of a dependency */
  getDependency(name: string): string | undefined {
    return (
      this.dependencies[name] ||
      this.devDependencies[name] ||
      this.peerDependencies[name]
    )
  }

  load() {
    return this._reload(this.uri('package.json'))
  }

  /** Watch the package.json for changes */
  watch(): void

  /** Create a watcher relative to this package */
  watch(globs: string[], events: WatchEvents): Watcher[]

  /** Implementation */
  watch(globs?: string[], events?: WatchEvents): Watcher[] | void {
    if (!this._isLocal) return globs ? [] : undefined
    if (globs) {
      let uri = this.uri()!
      let patterns = globs.map(glob => new RelativePattern(uri.path, glob))
      return watch(patterns, events!)
    }
    if (!this._watcher) {
      let packUri = this.uri('package.json')!
      let reload = () => this._reload(packUri)
      this._watcher = watch([packUri.path], {
        add: reload,
        change: reload,
        delete: reload,
      })[0]
    }
  }

  /** Must be called if you ever called `watch` without arguments */
  dispose(): void {
    this.off('*')

    this.subs.forEach(sub => sub.dispose())
    this.subs = []

    if (this._watcher) {
      this._watcher.dispose()
      this._watcher = undefined
    }
  }

  private get _ws() {
    return workspace.getWorkspaceFolder(Uri.file(this.root))
  }

  /** True if our workspace folder exists on disk */
  private get _isLocal() {
    let ws = this._ws
    return ws ? ws.uri.scheme == 'file' : false
  }

  /** Reload the given "package.json" URI and emit change events */
  private async _reload(uri: Uri | null): Promise<void> {
    if (this.exists('package.json')) {
      let data: Partial<Package> = (await readJSON(uri)) || {}
      let changes: string[]

      changes = shallowDiff(this.dependencies, data.dependencies)
      if (changes.length) {
        let deps = data.dependencies || {}
        changes.forEach(key => {
          this.emit('dependency', key, deps[key] || null, false)
        })
        this.dependencies = deps
      }

      changes = shallowDiff(this.devDependencies, data.devDependencies)
      if (changes.length) {
        let deps = data.devDependencies || {}
        changes.forEach(key => {
          this.emit('dependency', key, deps[key] || null, true)
        })
        this.devDependencies = deps
      }

      changes = shallowDiff(this.peerDependencies, data.peerDependencies)
      if (changes.length) {
        let deps = data.peerDependencies || {}
        changes.forEach(key => {
          this.emit('dependency', key, deps[key] || null, false)
        })
        this.peerDependencies = deps
      }

      changes = shallowDiff(this.engines, data.engines)
      if (changes.length) {
        this.engines = data.engines || {}
        changes.forEach(key => {
          this.emit('engine', key, this.engines[key] || null)
        })
      }

      console.info('Reloaded package.json:', this.root)
    }
  }
}

export async function readJSON(uri: Uri | null): Promise<object | undefined> {
  if (uri) {
    let doc = await workspace.openTextDocument(uri)
    if (!doc.isUntitled) {
      let data = JSON.parse(doc.getText())
      if (data && data.constructor == Object) {
        return data
      }
    }
  }
}

/**
 * Returns an array of:
 *   - keys that exist in `post` but *not* `pre`
 *   - keys whose value in `post` is *not* strictly equal to its value in `pre`
 */
function shallowDiff(
  pre?: { [key: string]: any },
  post?: { [key: string]: any }
): string[] {
  if (pre == null) {
    return post ? Object.keys(post) : []
  }
  if (post == null) {
    return Object.keys(pre)
  }
  let changed = []
  for (let key in pre) {
    if (pre[key] !== post[key]) {
      changed.push(key)
    }
  }
  for (let key in post) {
    if (key in pre) continue
    changed.push(key)
  }
  return changed
}
