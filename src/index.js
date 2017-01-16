import chokidar from 'chokidar'
import debounce from 'debounce'

let modifiedFiles = {}
let modifiedDirs = []
let isReady = false

const isModifiedDir = (path) => {
  for (let i = 0, l = modifiedDirs.length; i < l; i++) {
    if (modifiedDirs[i].indexOf(path) === 0) {
      return true
    }
  }

  return false
}

const metalsmithIncremental = plugin => (files, metalsmith, done) => {
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

  const backupFiles = {}
  let paths = Object.keys(files)

  // filter non-modified files
  for (let i = 0, l = paths.length; i < l; i++) {
    const path = paths[i]

    // eslint-disable-next-line no-continue
    if (modifiedFiles[path] || isModifiedDir(path)) continue

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

metalsmithIncremental.watch = (metalsmith, cwd) => {
  const watcher = chokidar.watch(metalsmith.source(), {
    ignoreInitial: true,
    cwd,
  })
  const debouncedBuild = debounce(() => {
    metalsmith.build((err) => {
      if (err) throw err

      modifiedFiles = {}
      modifiedDirs = []
    })
  }, 100)
  const modifiedFile = (path) => {
    modifiedFiles[path] = true
    debouncedBuild()
  }
  const modifiedDir = (path) => {
    modifiedDirs.push(path)
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
