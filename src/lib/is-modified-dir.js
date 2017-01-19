const isModifiedDir = (path, modifiedDirs) => {
  for (let i = 0, l = modifiedDirs.length; i < l; i++) {
    if (modifiedDirs[i].indexOf(path) === 0) {
      return true
    }
  }

  return false
}

export default isModifiedDir
