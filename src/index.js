import chalk from 'chalk'
import chokidar from 'chokidar'
import debounce from 'debounce'

import depGraph from './lib/dep-graph'
import isModifiedDir from './lib/is-modified-dir'
import log from './lib/log'

let modifiedFiles = {}
let modifiedDirs = []
let isReady = false

const metalsmithIncremental = (plugin, baseDir, depCheck) => (files, metalsmith, done) => {
  // only enable incremental builds after first build
  if (!isReady) {
    if (plugin.length === 3) {
      plugin(files, metalsmith, done)
    } else {
      plugin.apply(this, arguments)
      done()
    }

    return
  }

  // check dependencies first
  depGraph(files, modifiedFiles, modifiedDirs, baseDir, depCheck)

  const backupFiles = {}
  let paths = Object.keys(files)

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
    plugin.apply(this, arguments)
    cleanup()
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

metalsmithIncremental.watch = (metalsmith) => {
  const source = metalsmith.source()
  const watcher = chokidar.watch(source, {
    ignoreInitial: true,
    cwd: source,
  })
  const debouncedBuild = debounce(() => {
    log('start')
    metalsmith.build((err) => {
      if (err) throw err

      modifiedFiles = {}
      modifiedDirs = []

      log('done')
    })
  }, 100)
  const modifiedFile = (path) => {
    modifiedFiles[path] = true
    log(`${chalk.yellow(path)} changed`)
    debouncedBuild()
  }
  const modifiedDir = (path) => {
    modifiedDirs.push(path)
    log(`${chalk.yellow(path)} changed`)
    debouncedBuild()
  }

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

  function stopWatching() {
    watcher.close()
    process.exit(0)
  }
}

export default metalsmithIncremental
