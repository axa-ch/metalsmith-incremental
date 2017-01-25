import path from 'path'
import chalk from 'chalk'

import isInDir from './is-in-dir'
import getDepResolver from './get-dep-resolver'
import log from './log'

/**
 * Traverses all `files` of metalsmith and scans them for dependency syntax.
 * If a modified file is annotated as dependency, then this file is considered as modified too
 * and will be added to the `modifiedFiles` hash.
 *
 * @private
 * @param {Object} files - A hash of files from Metalsmith.
 * @param {Object} modifiedFiles - A hash of modified files paths.
 * @param {Array} modifiedDirs - A hash of modified directories.
 * @param {Metalsmith} metalsmith - The current Metalsmith instance.
 * @param {string} baseDir - The base directory to which relative paths are being resolved.
 * @param {RegExp|DependencyResolver|DependencyResolverMap} depResolver - A RegExp pattern or callback to resolve dependencies.
 */
const depGraph = (files, modifiedFiles, modifiedDirs, metalsmith, baseDir, depResolver) => {
  const paths = Object.keys(files)

  for (let i = 0, l = paths.length; i < l; i++) {
    const filePath = paths[i]

    // eslint-disable-next-line no-param-reassign
    depResolver = getDepResolver(filePath, depResolver)

    // no need to check files without regex
    // no need to check modified files / dirs
    if (!depResolver || modifiedFiles[filePath] || isInDir(filePath, modifiedDirs)) {
      paths.splice(i, 1)
      l--
      i--
      continue
    }

    const file = files[filePath]
    let match
    let dependencies = []
    let modifiedFilesList

    // collect matched dependencies
    if (typeof depResolver === 'function') {
      dependencies = depResolver(file, baseDir)
    } else {
      while ((match = depResolver.exec(file.contents)) !== null) {
        dependencies.push(match[1])
      }
    }

    for (let j = 0, k = dependencies.length; j < k; j++) {
      let dependency = dependencies[j]

      // absolute to optional baseDir
      if (baseDir && dependency.charAt(0) === path.sep) {
        dependency = path.join(baseDir, dependency)
        dependency = path.relative(metalsmith.source(), dependency)
      } else { // relative include/import/require whatever
        dependency = path.join(path.dirname(filePath), dependency)
      }

      if (modifiedFiles[dependency]
        || isInDir(dependency, modifiedFilesList || (modifiedFilesList = Object.keys(modifiedFiles)))
        || isInDir(dependency, modifiedDirs)) {
        // yes this is changed by reference
        // eslint-disable-next-line no-param-reassign
        modifiedFiles[filePath] = true

        // IMPORTANT: if matched -> reset loop (cause prior items could have included matched item)
        paths.splice(i, 1)
        l--
        i = 0

        log(`${chalk.yellow(filePath)} depends on ${chalk.blue(dependency)}`)
        break
      }
    }
  }
}

export default depGraph
