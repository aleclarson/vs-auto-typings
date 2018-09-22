import {
  Disposable,
  FileSystemWatcher,
  GlobPattern,
  Uri,
  workspace,
} from 'vscode'

export interface Watcher {
  glob: GlobPattern
  subs: Disposable[]
  dispose(): void
}

export type WatchEvents = {
  add?: (e: Uri) => void
  change?: (e: Uri) => void
  delete?: (e: Uri) => void
}

const dispose = (sub: Disposable) => sub.dispose()
const toArray = <T>(val: T | T[]): T[] => (Array.isArray(val) ? val : [val])

export function watch(
  globs: GlobPattern | GlobPattern[],
  events: WatchEvents
): Watcher[] {
  return toArray(globs).map(glob => {
    let watcher = workspace.createFileSystemWatcher(glob)
    return {
      glob,
      subs: [
        events.add && watcher.onDidCreate(events.add),
        events.change && watcher.onDidChange(events.change),
        events.delete && watcher.onDidDelete(events.delete),
      ].filter(sub => !!sub) as Disposable[],
      dispose() {
        watcher.dispose()
        this.subs.forEach(dispose)
      },
    }
  })
}
