import { async as exec } from '@cush/exec'
import { basename } from 'path'
import { Disposable, window } from 'vscode'
import { getDefault } from './defaults'
import { Package } from './package'
import { Watcher } from './watcher'

import { npm } from './bin/npm'
import { yarn } from './bin/yarn'

const bins: BinMap = { npm, yarn, pnpm: npm }
type BinMap = {
  [key: string]: {
    install(name: string, version: string, dev: boolean): any[]
    uninstall(name: string): any[]
  }
}

type RelevantFile = keyof typeof relevantFiles
const relevantFiles = {
  // NPM
  '.npmrc': 'npm',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  // Yarn
  '.yarnrc': 'yarn',
  'yarn.lock': 'yarn',
  // PNPM
  '.pnpmrc': 'pnpm',
  'shrinkwrap.yaml': 'pnpm',
}

interface InstallTask {
  name: string
  version: string | null
  dev?: boolean
}

export class Installer {
  pack: Package
  /** True to install typings as "devDependencies" */
  dev?: boolean
  /** The package manager being used */
  bin?: string
  /** Subscriptions associated with this installer */
  subs: Disposable[]

  private _queue: InstallTask[]
  private _watcher?: Watcher
  private _flushing?: Promise<void>

  constructor(pack: Package) {
    this.pack = pack
    this.dev = undefined
    this.bin = undefined
    this.subs = []
    this._queue = []
    this._checkDev()
    this._checkBin()
    this._watch()
  }

  install(name: string, version: string, dev?: boolean) {
    this._queue.push({ name, version, dev })
    this._flush()
  }

  uninstall(name: string) {
    this._queue.push({ name, version: null })
    this._flush()
  }

  dispose(): void {
    this.subs.forEach(sub => sub.dispose())
    this.subs = []

    if (this._watcher) {
      this._watcher.dispose()
      this._watcher = undefined
    }
  }

  /** Process any queued tasks */
  private _flush(): void {
    if (this._flushing) return
    let next: () => Promise<void>
    this._flushing = (next = async () => {
      let task = this._queue.shift()
      if (task) {
        let bin = this.bin || getDefault('bin')
        let args: any[]
        if (task.version) {
          let dev =
            task.dev == null
              ? this.dev == null
                ? getDefault('dev')
                : this.dev
              : task.dev

          args = bins[bin].install(task.name, task.version, dev)
        } else {
          args = bins[bin].uninstall(task.name)
        }

        try {
          if (task.version) {
            window.showInformationMessage('Installing: ' + task.name)
          } else {
            window.showInformationMessage('Removing: ' + task.name)
          }
          console.info('Running', [bin].concat(args), 'in', this.pack.root)
          await exec(bin, args, {
            cwd: this.pack.root,
            env: process.env,
          })
        } catch (err) {
          // TODO: Delegate this logic to the bin
          let match = /404 Not Found: ([^\s]+)/.exec(err.message)
          if (match && match[0] == task.name + '@' + task.version) {
            // TODO: Notify user the package does not exist
            console.info('Package not found:', task.name + '@' + task.version)
          } else {
            console.error(err)
          }
        }
        return next()
      }
      this._flushing = undefined
    })()
  }

  /** Sniff out the `dev` property */
  private _checkDev(): void {
    this.dev = Object.keys(this.pack.dependencies).some(hasTypings)
      ? false
      : Object.keys(this.pack.devDependencies).some(hasTypings)
        ? true
        : undefined
  }

  /** Sniff out the `bin` property */
  private _checkBin(): void {
    for (let bin in bins) {
      if (this.pack.engines[bin] != null) {
        this.bin = bin
        return
      }
    }
    let file: RelevantFile
    for (file in relevantFiles) {
      if (this.pack.exists(file)) {
        this.bin = relevantFiles[file]
        return
      }
    }
    this.bin = undefined
  }

  /** Keep our properties accurate */
  private _watch(): void {
    if (!this._watcher) {
      let glob = '{' + Object.keys(relevantFiles).join(',') + '}'
      this._watcher = this.pack.watch([glob], {
        add: uri => {
          let file = basename(uri.path) as RelevantFile
          this.bin = relevantFiles[file]
        },
        delete: uri => {
          let file = basename(uri.path) as RelevantFile
          if (relevantFiles[file] == this.bin) {
            this._checkBin()
          }
        },
      })[0]

      /** The "engines" field may contain a hint */
      this.pack.on(
        'engine',
        (name, version) => {
          if (bins[name] != null) {
            if (version) {
              this.bin = name
            } else if (name == this.bin) {
              this._checkBin()
            }
          }
        },
        this._watcher.subs
      )

      /** Try to resolve the `dev` property */
      if (this.dev == null) {
        const self = this.pack.on(
          'dependency',
          (name, version, dev) => {
            if (name.startsWith('@types/')) {
              this.dev = dev
              this.pack.off('dependency', self)
            }
          },
          this._watcher.subs
        )
      }
    }
  }
}

function hasTypings(key: string) {
  return key.startsWith('@types/')
}
