import path from 'path'
import chalk from 'chalk'
import chokidar from 'chokidar'
import debounce from 'debounce'
import clone from 'clone'
import minimatch from 'minimatch'

import depGraph from './lib/dep-graph'
import isInDir from './lib/is-in-dir'
import resolveRename from './lib/resolve-rename'
import log from './lib/log'

const defaults = {
  delay: 100,
}
let modifiedFiles = {}
let modifiedDirs = []
let removedFiles = {}
let removedDirs = []
let forceGlobs = []
let isWatching = false
let isReady = false

/**
 * An object which defines renaming rules.
 *
 * @typedef {Object} RenameObject
 * @property {RegExp|string} from - A pattern to match.
 * @property {string} to - A string to replace matched value.
 */

/**
 * An object which define a path.
 *
 * @typedef {Object} PathObject
 * @property {string} path.basename - The name of the file without it's extension.
 * @property {string} path.dirname - The directory path of the file.
 * @property {string} path.extname - The file extension (including the dot).
 */

/**
 * A callback which defines renaming rules.
 *
 * @callback RenameFunction
 * @param {PathObject} path - The current path of the file.
 *
 * @returns {PathObject} path - The new path to be used.
 */

/**
 * Paths pattern map to force rebuilding unmodified files.
 *
 * @typedef {Object} PathsObject
 * @property {Glob|string} - A `glob` or `string` map specifying which other files should run through the pipeline.
 */

/**
 * Returns the selected `metalsmith-incremental` subplugin.
 * Use:
 * * `filter`: to remove unmodified files from the pipeline
 * * `cache`: to cache current state in the pipeline and to restore filtered files by `filter`
 * * `watch`: to start watching for file changes (can be used only once)
 *
 * @param {Object} [options] - Plugin options hash.
 * @param {string} [options.plugin=filter] - Specify the sub plugin to use - `filter`, `cache` or `watch`.
 * @param {string} [options.baseDir] - The baseDir to which to resolve absolute paths in dependencies (`filter` only).
 * @param {RegExp|Function} [options.depResolver] - A RegExp pattern or callback to resolve dependencies (`filter` only).
 * @param {RenameObject|RenameFunction} [options.rename] - A function or object defining renaming rules (`cache` only).
 * @param {PathsObject|string} [options.paths] - A glob-pattern map which forces updates of mapped files (`watch` only).
 * @param {number} [options.delay=100] - The number of milliseconds the rebuild is delayed to wait for additional changes (`watch` only).
 * @returns {Function} - Returns the specified metalsmith sub plugin - `filter`, `cache` or `watch`.
 */
const metalsmithIncremental = (options) => {
  const { plugin } = options
  let cached

  switch (plugin) {
    case 'cache':
      return cache
    case 'watch':
      return watch

    default:
      return filter
  }

  function filter(files, metalsmith, done) {
    if (!isReady) {
      done()
      return
    }

    setImmediate(done)

    const filesPaths = Object.keys(files)
    const { baseDir, depResolver } = options

    // first add forced globs
    if (forceGlobs.length) {
      forceGlobs.forEach((glob) => {
        filesPaths.filter(minimatch.filter(glob))
          .forEach((filePath) => {
            modifiedFiles[filePath] = true

            log(`${chalk.yellow(filePath)} force update`)
          })
      })
    }

    // second check dependencies
    depGraph(files, modifiedFiles, modifiedDirs, metalsmith, baseDir, depResolver)

    // filter non-modified files
    for (let i = 0, l = filesPaths.length; i < l; i++) {
      const filePath = filesPaths[i]

      if (modifiedFiles[filePath] || isInDir(filePath, modifiedDirs)) continue

      // eslint-disable-next-line no-param-reassign
      delete files[filePath]
    }
  }

  function cache(files, metalsmith, done) {
    setImmediate(done)

    const clonedFiles = clone(files)

    if (cached) {
      const { rename } = options
      const renameIsFunc = typeof rename === 'function'
      const renameIsRegex = !renameIsFunc && typeof rename === 'object' && rename.from && rename.to
      const validRename = renameIsFunc || renameIsRegex

      if (renameIsRegex && typeof rename.from === 'string') {
        rename.from = new RegExp(rename.from)
      }

      // delete removed Files
      const removedFilesKeys = Object.keys(removedFiles)

      for (let i = 0, l = removedFilesKeys.length; i < l; i++) {
        let removedFileKey = removedFilesKeys[i]
        let found = !!cached[removedFileKey]

        // if file not found -> may it's renamed
        if (!found && validRename) {
          removedFileKey = resolveRename(removedFileKey, rename)

          if (cached[removedFileKey]) {
            found = true
          }
        }

        // remove found file
        if (found) {
          delete cached[removedFileKey]
          delete removedFiles[removedFileKey]
        }
      }

      // delete removed directories
      const cachedKeys = Object.keys(cached)

      for (let i = 0, l = cachedKeys.length; i < l; i++) {
        const cachedKey = cachedKeys[i]

        if (isInDir(cachedKey, removedDirs)) {
          delete cached[cachedKey]
        }
      }

      // restore cache
      const filesToRestore = clone(cached)
      const filesToRestoreKeys = Object.keys(filesToRestore)

      for (let i = 0, l = filesToRestoreKeys.length; i < l; i++) {
        const cachedKey = filesToRestoreKeys[i]

        if (files[cachedKey] || files(resolveRename(cachedKey, rename))) {
          continue
        }

        // eslint-disable-next-line no-param-reassign
        files[cachedKey] = filesToRestore[cachedKey]
      }
    }

    cached = {
      ...cached,
      ...clonedFiles,
    }
  }

  function watch(files, metalsmith, done) {
    if (isWatching) {
      done()
      return
    }
    isWatching = true

    setImmediate(done)

    // eslint-disable-next-line no-param-reassign
    options = {
      ...defaults,
      ...options,
    }

    if (typeof options.path === 'string') {
      // eslint-disable-next-line no-param-reassign
      options.path = {
        [options.path]: options.path,
      }
    }

    if (typeof options.delay !== 'number') {
      // eslint-disable-next-line no-param-reassign
      options.delay = defaults.delay
    }

    const { delay, paths } = options
    const source = metalsmith.source()
    const watcher = chokidar.watch(source, {
      ignoreInitial: true,
      cwd: source,
    })
    const debouncedBuild = debounce(triggerBuild, delay)

    process.on('SIGTERM', stopWatching)
    process.on('SIGINT', stopWatching)
    process.on('SIGQUIT', stopWatching)

    watcher.on('ready', () => { isReady = true })
      .on('all', handleAll)

    function triggerBuild() {
      log('start')

      if (paths) {
        const globs = Object.keys(paths)
        const modifiedFilesList = Object.keys(modifiedFiles)

        globs.forEach((glob) => {
          if (minimatch.match(modifiedFilesList, glob)) {
            forceGlobs.push(paths[glob])
          }
        })
      }

      metalsmith.build((err) => {
        if (err) throw err

        modifiedFiles = {}
        modifiedDirs = []
        removedFiles = {}
        removedDirs = []
        forceGlobs = []

        log('done')
      })
    }

    function handleAll(event, filePath) {
      switch (event) {
        case 'add':
        case 'change':
          modifiedFiles[filePath] = true
          break

        case 'unlink':
          removedFiles[filePath] = true
          break

        case 'addDir':
          modifiedDirs.push(filePath)
          break

        case 'unlinkDir':
          removedDirs.push(filePath)
          break

        default:
          return
      }

      log(`${event} ${chalk.yellow(filePath)}`)

      debouncedBuild()
    }

    function stopWatching() {
      watcher.close()
      process.exit(0)
    }
  }
}

export default metalsmithIncremental
