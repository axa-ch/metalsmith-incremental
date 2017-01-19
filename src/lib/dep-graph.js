import path from 'path'

import isModifiedDir from './is-modified-dir'

const reDepPug = /include\s+([^\s]+)/mg

const depGraph = (files, modifiedFiles, modifiedDirs, baseDir, reDep = reDepPug) => {
  const paths = Object.keys(files)
  const dependencies = {}

  for (let i = 0, l = paths.length; i < l; i++) {
    const filePath = paths[i]

    // no need to check modified files / dirs
    if (modifiedFiles[filePath] || isModifiedDir(filePath, modifiedDirs)) {
      paths.splice(i, 1)
      l--
      i--
      continue
    }

    const file = files[filePath]
    let match
    let dependency

    while ((match = reDep.exec(file.contents)) !== null) {
      dependency = match[1]

      if (dependencies.charAt(0) === path.sep) {
        dependency = path.join(baseDir, dependency)
      } else {
        dependency = path.join(path.dirname(filePath), dependency)
      }

      if (modifiedFiles[dependency] || isModifiedDir(path, modifiedDirs)) {
        // yes this is changed by reference
        // eslint-disable-next-line no-param-reassign
        modifiedFiles[filePath] = true

        // IMPORTANT: if matched -> reset loop (cause prior items could have included matched item)
        paths.splice(i, 1)
        l--
        i = 0
      }
    }
  }
}

export default depGraph
