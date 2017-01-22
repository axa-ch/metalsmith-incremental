const isInDir = (path, dirs) => {
  for (let i = 0, l = dirs.length; i < l; i++) {
    if (dirs[i].indexOf(path) === 0) {
      return true
    }
  }

  return false
}

export default isInDir
