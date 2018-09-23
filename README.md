# vs-auto-typings

Dependency manager for `@types/` packages (in VS Code)

Inspired by: https://github.com/jvitor83/types-autoinstaller

### How it works

Before anything happens, your package **must** have a `tsconfig.json` module.

When an NPM dependency is added, the associated `@types/` package is installed if the dependency does _not_ itself contain a `tsconfig.json` module or have a `"typings"/"types"` field in its `package.json` module.

When an NPM dependency is removed, any associated `@types/` package is uninstalled.

This extension constantly watches all directories that contain a `package.json` module and have no ancestor named `node_modules`. This means you can add a `tsconfig.json` module at any time, and this extension will start managing (or stop managing) your `@types/` dependencies.

Any package in the workspace (even nested packages) are eligible to be managed by this extension, except for packages contained in a `node_modules` directory. This extension picks up on newly created packages without issue.

The `typings.bin` setting lets you choose the default package manager. This extension attempts to resolve the correct package manager on a per-package basis by looking for `.npmrc`, `yarn.lock`, and other indicators. By default, NPM is used.

The `typings.dev` setting lets you choose the default namespace to put `@types/` packages in. This extension attempts to resolve the `@types/` namespace on a per-package basis by looking for pre-existing `@types/` dependencies in the `package.json` module. By default, they are added to `"devDependencies"`.

If you add a dev dependency, its associated `@types/` package will **always** be installed as dev dependency.
