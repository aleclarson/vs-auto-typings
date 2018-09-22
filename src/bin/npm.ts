export let npm = {
  install(name: string, version: string, dev: boolean) {
    return ['install', name + '@' + version, dev ? '-D' : undefined]
  },
  uninstall(name: string) {
    return ['uninstall', name]
  },
}
