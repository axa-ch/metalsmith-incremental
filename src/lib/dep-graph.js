import path from 'path'

import isModifiedDir from './is-modified-dir'
import getDepCheck from './get-dep-check'

const depGraph = (files, modifiedFiles, modifiedDirs, baseDir, depCheck) => {
  const paths = Object.keys(files)

  for (let i = 0, l = paths.length; i < l; i++) {
    const filePath = paths[i]

    // eslint-disable-next-line no-param-reassign
    depCheck = getDepCheck(filePath, depCheck)

    // no need to check files without regex
    // no need to check modified files / dirs
    if (!depCheck || modifiedFiles[filePath] || isModifiedDir(filePath, modifiedDirs)) {
      paths.splice(i, 1)
      l--
      i--
      continue
    }

    const file = files[filePath]
    let match
    let dependencies = []

    // collect matched dependcies
    if (typeof depCheck === 'function') {
      dependencies = depCheck(file, baseDir)
    } else {
      while ((match = depCheck.exec(file.contents)) !== null) {
        dependencies.push(match[1])
      }
    }

    for (let j = 0, k = dependencies.length; j < k; j++) {
      let dependency = dependencies[j]

      // absolute to optional baseDir
      if (baseDir && dependency.charAt(0) === path.sep) {
        dependency = path.join(baseDir, dependency)
      } else { // relative include/import/require whatever
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
        continue
      }
    }
  }
}

export default depGraph
