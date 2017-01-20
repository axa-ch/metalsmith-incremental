import chalk from 'chalk'
import chokidar from 'chokidar'
import debounce from 'debounce'
import minimatch from 'minimatch'

import depGraph from './lib/dep-graph'
import isModifiedDir from './lib/is-modified-dir'
import log from './lib/log'

const defaults = {
  debouce: 100,
}
let modifiedFiles = {}
let modifiedDirs = []
let forceGlobs = []
let isReady = false

const metalsmithIncremental = (plugin, baseDir, depCheck) => (files, metalsmith, done) => {
  // only enable incremental builds after first build
  if (!isReady) {
    if (plugin.length === 3) {
      plugin(files, metalsmith, done)
    } else {
      try {
        plugin(files, metalsmith)
        done()
      } catch (err) {
        done(err)
      }
    }

    return
  }

  const backupFiles = {}
  let paths = Object.keys(files)

  // first add forced globs
  if (forceGlobs.length) {
    forceGlobs.forEach((glob) => {
      paths.filter(minimatch.filter(glob))
        .forEach((path) => {
          modifiedFiles[path] = true

          log(`${chalk.yellow(path)} force update`)
        })
    })
  }

  // second check dependencies
  depGraph(files, modifiedFiles, modifiedDirs, metalsmith, baseDir, depCheck)

  // filter non-modified files
  for (let i = 0, l = paths.length; i < l; i++) {
    const path = paths[i]

    if (modifiedFiles[path] || isModifiedDir(path, modifiedDirs)) continue

    backupFiles[path] = files[path]
    // eslint-disable-next-line no-param-reassign
    delete files[path]
  }

  // execute plugin
  if (plugin.length === 3) {
    plugin(files, metalsmith, (err) => {
      cleanup(err)
    })
  } else {
    try {
      plugin(files, metalsmith)
      cleanup()
    } catch (err) {
      cleanup(err)
    }
  }

  // cleaup
  function cleanup(err) {
    // if files got renamed -> add them to modified list
    paths = Object.keys(files)

    for (let i = 0, l = paths.length; i < l; i++) {
      const path = paths[i]

      if (!modifiedFiles[path]) {
        modifiedFiles[path] = true
      }
    }

    // restore filtered files from backup
    paths = Object.keys(backupFiles)

    for (let i = 0, l = paths.length; i < l; i++) {
      const path = paths[i]

      // eslint-disable-next-line no-param-reassign
      files[path] = backupFiles[path]
    }

    done(err)
  }
}

metalsmithIncremental.watch = (metalsmith, options) => {
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

  if (typeof options.dounce !== 'number') {
    // eslint-disable-next-line no-param-reassign
    options.dounce = defaults.debouce
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

  watcher.on('add', modifiedFile)
    .on('change', modifiedFile)
    .on('unlink', modifiedFile)
    .on('addDir', modifiedDir)
    .on('unlinkDir', modifiedDir)
    .on('ready', () => {
      isReady = true
    })

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
      forceGlobs = []

      log('done')
    })
  }

  function modifiedFile(path) {
    modifiedFiles[path] = true
    log(`${chalk.yellow(path)} changed`)
    debouncedBuild()
  }

  function modifiedDir(path) {
    modifiedDirs.push(path)
    log(`${chalk.yellow(path)} changed`)
    debouncedBuild()
  }

  function stopWatching() {
    watcher.close()
    process.exit(0)
  }
}

export default metalsmithIncremental
