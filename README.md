# vs-auto-typings

Dependency manager for `@types/` packages (in VS Code)

Inspired by: https://github.com/jvitor83/types-autoinstaller

### Features

When an NPM dependency is added, the associated `@types/` package is installed
if the dependency does _not_ itself depend on `typescript` or have a `"typings"`
field in its `package.json` module.

When an NPM dependency is removed, any associated `@types/` package is uninstalled.

Before anything happens, your package **must** have:

- a `tsconfig.json` module
- `typescript` in its `"devDependencies"`

This extension constantly watches all directories that contain a `package.json` module
and have no ancestor named `node_modules`. This means you can add a `tsconfig.json` module
or add `typescript` to your `"devDependencies"` at any time, and this extension will
start managing (or stop managing) your `@types/` dependencies.

Any package in the workspace (even nested packages) are eligible to be managed
by this extension, except for packages contained in a `node_modules` directory.
This extension picks up on newly created packages without issue.

In the settings, you can choose the default package manager to use. This extension
attempts to resolve the correct package manager on a per-package basis by looking
for `.npmrc`, `yarn.lock`, and other indicators.

In the settings, you can choose the default namespace to put `@types/` packages in.
All `@types/` packages are installed as dev dependencies by default. Use the `typings.dev`
setting to control this behavior. This extension attempts to resolve the `@types/`
namespace on a per-package basis by looking for pre-existing `@types/` dependencies in
the `package.json` module.

If you add a dev dependency, its associated `@types/` package will **always** be
installed as dev dependency.
