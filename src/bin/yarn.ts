export let yarn = {
  install(name: string, version: string, dev: boolean) {
    return ['add', name + '@' + version, dev ? '-D' : undefined]
  },
  uninstall(name: string) {
    return ['remove', name]
  },
}
