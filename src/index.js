import path from 'path'
import isRegex from 'is-regex'
import chalk from 'chalk'
import chokidar from 'chokidar'
import debounce from 'debounce'
import clone from 'clone'
import minimatch from 'minimatch'

import depGraph from './lib/dep-graph'
import isInDir from './lib/is-in-dir'
import log from './lib/log'

const defaults = {
  debounce: 100,
}
let modifiedFiles = {}
let modifiedDirs = []
let removedFiles = {}
let removedDirs = []
let forceGlobs = []
let isWatching = false
let isReady = false

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

      // delete removed Files
      const removedFilesKeys = Object.keys(removedFiles)

      for (let i = 0, l = removedFilesKeys.length; i < l; i++) {
        let removedFileKey = removedFilesKeys[i]
        let found = !!cached[removedFileKey]

        // if file not found -> may it's renamed
        if (!found && validRename) {
          if (renameIsFunc) {
            const extname = path.extname(removedFileKey)
            const renamed = rename({
              dirname: path.dirname(removedFileKey),
              basename: path.basename(removedFileKey, extname),
              ext: extname,
            })

            removedFileKey = path.join(renamed.dirname, `${renamed.basename}${renamed.ext}`)
          } else if (renameIsRegex) {
            removedFileKey = removedFileKey.replace(rename.from, rename.to)
          }

          found = !!cached[removedFileKey]
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
    if (isWatching) return
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

    if (typeof options.debounce !== 'number') {
      // eslint-disable-next-line no-param-reassign
      options.debounce = defaults.debounce
    }

    const source = metalsmith.source()
    const watcher = chokidar.watch(source, {
      ignoreInitial: true,
      cwd: source,
    })
    const debouncedBuild = debounce(triggerBuild, options.debounce)

    process.on('SIGTERM', stopWatching)
    process.on('SIGINT', stopWatching)
    process.on('SIGQUIT', stopWatching)

    watcher.on('ready', () => { isReady = true })
      .on('all', handleAll)

    function triggerBuild() {
      log('start')

      if (options.paths) {
        const globs = Object.keys(options.paths)
        const modifiedFilesList = Object.keys(modifiedFiles)

        globs.forEach((glob) => {
          if (minimatch.match(modifiedFilesList, glob)) {
            forceGlobs.push(options.paths[glob])
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

    function handleAll(event, path) {
      switch (event) {
        case 'add':
        case 'change':
          modifiedFiles[path] = true
          break

        case 'unlink':
          removedFiles[path] = true
          break

        case 'addDir':
          modifiedDirs.push(path)
          break

        case 'unlinkDir':
          removedDirs.push(path)
          break

        default:
          return
      }

      log(`${event} ${chalk.yellow(path)}`)

      debouncedBuild()
    }

    function stopWatching() {
      watcher.close()
      process.exit(0)
    }
  }
}

export default metalsmithIncremental
