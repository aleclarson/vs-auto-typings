import { dirname, extname, join } from 'path'
import { isFile } from 'saxon/sync'
import * as semver from 'semver'
import { commands, ExtensionContext, Uri, workspace } from 'vscode'
import { Installer } from './installer'
import { Package, readJSON } from './package'
import { watch } from './watcher'

/** This cache even contains packages without Typescript */
const packages: PackageCache = Object.create(null)
type PackageCache = { [key: string]: Package }

/** Installer objects for packages with Typescript */
const installers: InstallerCache = Object.create(null)
type InstallerCache = { [key: string]: Installer }

const nodeModulesRE = /\/node_modules\//
const noop = () => {}

const TS_DEP = 'typescript'
const TS_PREFIX = '@types/'

export async function activate(ctx: ExtensionContext) {
  ctx.subscriptions.push(
    // This command simply activates the extension.
    commands.registerCommand('typings.check-workspace', noop)
  )

  // Find packages in the workspace.
  let files = await workspace.findFiles('**/package.json')
  files.map(file => dirname(file.path)).forEach(loadPackage)

  // Watch for added/deleted packages.
  ctx.subscriptions.push(
    watch(['**/package.json'], {
      add: file => loadPackage(dirname(file.path)),
      delete: file => {
        let root = dirname(file.path)
        if (nodeModulesRE.test(root)) return

        packages[root].dispose()
        delete packages[root]

        let installer = installers[root]
        if (installer) {
          installer.dispose()
          delete installers[root]
        }
      },
    })[0]
  )

  async function loadPackage(root: string): Promise<void> {
    if (nodeModulesRE.test(root)) return

    let pack = packages[root]
    if (pack == null) {
      pack = new Package(root)
      pack.watch()
      if (pack.isWatched) {
        await pack.load()
        packages[root] = pack
      } else return
    } else return

    // Create an installer immediately if possible.
    let installer: Installer | undefined
    if (pack.exists('tsconfig.json')) {
      installer = new Installer(pack)
      installers[root] = installer
    }

    // Watch the dependencies of every package.
    pack.on('dependency', (name, version, dev) => {
      onDependency(name, version, dev).catch(console.error)
    })

    // Watch the "tsconfig.json" module
    pack.subs.push(
      pack.watch(['tsconfig.json'], {
        add() {
          console.info('Enabled auto-typings for package:', root)
          installer = new Installer(pack)
          installers[root] = installer
        },
        delete() {
          console.info('Disabled auto-typings for package:', root)
          installer!.dispose()
          installer = undefined
        },
      })[0]
    )

    async function onDependency(
      name: string,
      version: string | null,
      dev: boolean
    ) {
      console.info('Dependency changed:', name, version, '(dev:', dev + ')')
      if (name.startsWith(TS_PREFIX)) return
      if (version) {
        if (pack.getDependency(name)) return
        if (!semver.valid(version) && !semver.validRange(version)) return
      }
      if (installer) {
        if (version) {
          let dep = join(pack.root, 'node_modules', name)

          // Install typings for packages without any included.
          if (await isPackageTyped(dep)) return
          if (!hasTypingsFor(pack, name)) {
            // Typings are never installed in "dependencies"
            // when the associated package is in "devDependencies"
            installer.install(TS_PREFIX + name, '*', dev ? true : undefined)
          }
        }
        // Uninstall typings when the corresponding package is uninstalled.
        else if (hasTypingsFor(pack, name)) {
          installer.uninstall(TS_PREFIX + name)
        }
      }
    }
  }

  /** Return true if the given package has typings for the given dependency */
  function hasTypingsFor(pack: Package, name: string): boolean {
    return !!(
      pack.dependencies[TS_PREFIX + name] ||
      pack.devDependencies[TS_PREFIX + name]
    )
  }

  /** Resolves to true if the given package has typings */
  async function isPackageTyped(root: string): Promise<boolean> {
    // Look for tsconfig.json
    if (isFile(join(root, 'tsconfig.json'))) {
      return true
    }
    let data: any = await readJSON(Uri.file(join(root, 'package.json')))
    if (data) {
      // Look for "typings" or "types" field
      if (data.typings || data.types) {
        return true
      }
      // Look for .d.ts module
      let main: string = data.main || 'index.js'
      main = main.slice(0, -extname(main).length) + '.d.ts'
      return isFile(join(root, main))
    }
    return false
  }
}

export function deactivate() {
  Object.keys(packages).forEach(root => {
    packages[root].dispose()
    delete packages[root]

    let installer = installers[root]
    if (installer) {
      installer.dispose()
      delete installers[root]
    }
  })
}
