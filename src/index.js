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
let filtered = {}
let isWatching = false
let isRunning = false

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
 * @param {RegExp|DependencyResolver|DependencyResolverMap} [options.depResolver] - A RegExp pattern or callback to resolve dependencies (`filter` only).
 * @param {RenameObject|RenameFunction} [options.rename] - A function or object defining renaming rules (`cache` only).
 * @param {PropsList} [options.props=['contents']] - An array of property names to sync from cached files to new files (`cache` only).
 * @param {PathsObject|string} [options.paths] - A glob-pattern map which forces updates of mapped files (`watch` only).
 * @param {number} [options.delay=100] - The number of milliseconds the rebuild is delayed to wait for additional changes (`watch` only).
 * @returns {filter|cache|watch} - Returns the specified metalsmith sub plugin - `filter`, `cache` or `watch`.
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

  /**
   * Removes unmodified files from the pipeline by resolving:
   * * changed, added, removed files or directories
   * * resolving glob map matches
   * * infer dependencies
   *
   * **Options**
   * * `baseDir`
   * * `depResolver`
   *
   * @param {Object} files
   * @param {MetalSmith} metalsmith
   * @param {Function} done
   *
   * @example
   *
   * metalsmith.usw(incremental({
   *  plugin: 'filter', // default 'filter' -> can be omitted
   *  baseDir: 'your/base/dir',
   * }))
   *
   * @example <caption>Resolving Dependencies by RegExp</caption>
   *
   * metalsmith.usw(incremental({
   *  baseDir: 'your/base/dir',
   *  // important the first capturing group must contain the dependency path
   *  depResolver: /(?:include|extends)\s+([^\s]+)/mg,
   * }))
   *
   * @example <caption>Resolving Dependencies by Hash-Map</caption>
   *
   * metalsmith.usw(incremental({
   *  baseDir: 'your/base/dir',
   *  depResolver: {
   *    pug: /(?:include|extends)\s+([^\s]+)/mg,
   *  },
   * }))
   *
   * @example <caption>Resolving Dependencies by Function</caption>
   *
   * metalsmith.usw(incremental({
   *  baseDir: 'your/base/dir',
   *  depResolver: (file, baseDir) {
   *    // read file contents
   *    const contents = file.contents
   *    const dependencies = []
   *
   *    // ... your custom dependencies resolve algorith here
   *
   *    return dependencies
   *  },
   * }))
   */
  function filter(files, metalsmith, done) {
    setImmediate(done)

    if (!isRunning) {
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

      filtered[filePath] = files[filePath]
      // eslint-disable-next-line no-param-reassign
      delete files[filePath]
    }
  }

  /**
   * Caches all files at the specific point in the pipeline and
   * restores unmodified files filtered previously by `filter`.
   *
   * **Options**
   * * `rename`
   * * `props`
   *
   * @param {Object} files
   * @param {MetalSmith} metalsmith
   * @param {Function} done
   *
   * @example
   *
   * metalsmith.use(increment({
   *  plugin: 'cache',
   * })
   *
   * @example <caption>Renaming files by RegExp</caption>
   *
   * metalsmith.use(increment({
   *  plugin: 'cache',
   *  rename: {
   *    from: /.pug$/,
   *    to: '.html',
   *  },
   * })
   *
   * @example <caption>Renaming files by function</caption>
   *
   * metalsmith.use(increment({
   *  plugin: 'cache',
   *  rename: (path) => {
   *    path.extname = path.extname.replace('.pug', '.html')
   *
   *    return path
   *  },
   * })
   */
  function cache(files, metalsmith, done) {
    setImmediate(done)

    const clonedFiles = clone(files)

    if (isRunning) {
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

      // restore filtered files and update by cache
      const filteredKeys = Object.keys(filtered)
      let { props } = options

      for (let i = 0, l = filteredKeys.length; i < l; i++) {
        const filteredKey = filteredKeys[i]
        let cachedKey = filteredKey
        let found = cachedKey in cached

        if (!found && validRename) {
          cachedKey = resolveRename(cachedKey, rename)

          found = cachedKey in cached
        }

        if (found) {
          const file = filtered[filteredKey]
          const cache = cached[cachedKey]

          file.contents = cache.contents

          if (props) {
            if (!Array.isArray(props)) {
              props = [props]
            }

            for (let j = 0, k = props.length; j < k; j++) {
              const prop = props.length

              if (Array.isArray(prop)) {
                let tmpFile = file
                let tmpCache = cache

                for (let n = 0, m = prop.length; n < m; n++) {
                  const key = prop[n]

                  if (n === m - 1 || !(key in tmpFile)) {
                    tmpFile[key] = tmpCache[key]
                    break
                  } else if (tmpFile[key] && tmpCache[key]) {
                    tmpFile = tmpFile[key]
                    tmpCache = tmpCache[key]
                  }
                }
              } else {
                file[prop] = cache[prop]
              }
            }
          }

          // eslint-disable-next-line no-param-reassign
          files[cachedKey] = file
        }
      }

      // reset filtered
      filtered = {}

      // update modifiedFiles hash
      Object.keys(clonedFiles).forEach((key) => {
        modifiedFiles[key] = true
      })
    }

    cached = {
      ...cached,
      ...clonedFiles,
    }
  }

  /**
   * Starts watching for file system changes inside `metalsmith.source()` directory.
   *
   * **Options**
   * * `paths`
   * * `delay`
   *
   * @param {Object} files
   * @param {MetalSmith} metalsmith
   * @param {Function} done
   *
   * @example
   *
   * // optionally enable watching
   * if(process.env.NODE_ENV === 'development') {
   *  metalsmith.use(incremental({ plugin: 'watch' }))
   * }
   *
   * @example <caption>Set debounce delay in [ms]</caption>
   *
   * metalsmith.use(incremental({
   *  plugin: 'watch',
   *  debounce: 200,
   * }))
   *
   * @example <caption>Force to rebuild other unmodified files by glob pattern map</caption>
   *
   * metalsmith.use(incremental({
   *  plugin: 'watch',
   *  paths: {
   *    'foo/*.md': 'bar/*.pug',
   *  },
   * }))
   */
  function watch(files, metalsmith, done) {
    setImmediate(done)

    if (isWatching) {
      return
    }
    isWatching = true

    const origBuild = metalsmith.build
    let buildDoneFn
    metalsmith.build = spyBuild

    // eslint-disable-next-line no-param-reassign
    options = {
      ...defaults,
      ...options,
    }

    if (typeof options.paths === 'string') {
      // eslint-disable-next-line no-param-reassign
      options.paths = {
        [options.paths]: options.paths,
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

    watcher.on('ready', () => { log('ready to watch') })
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

      isRunning = true
      metalsmith.build((err) => {
        modifiedFiles = {}
        modifiedDirs = []
        removedFiles = {}
        removedDirs = []
        forceGlobs = []

        log('done')

        isRunning = false

        buildDoneFn(err)
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

    function spyBuild(fn, ...rest) {
      if (!buildDoneFn) {
        buildDoneFn = fn
      }

      origBuild.apply(metalsmith, [fn, ...rest])
    }
  }
}

export default metalsmithIncremental

/**
 * A callback which defines renaming rules.
 *
 * @callback DependencyResolver
 * @param {Object} file - The currently processed file.
 * @param {string} baseDir - The supplied `baseDir` by `options.baseDir`.
 *
 * @returns {Array|null} dependencies - Returns an array of dependencies (relative to `baseDir`).
 */

/**
 * An object mapping file extension to related dependency resolving methods.
 *
 * **Important**
 * The first capturing group of your RegExp needs to contain the dependency path.
 *
 * @typedef {Object.<string, (RegExp|DependencyResolver)>} DependencyResolverMap
 */

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
 * A single property or list of properties to sync between cached an new files,
 * representing either one single property or a complete property path, like:
 *
 * ````js
 * var obj = {
 *  foo: 1,
 *  bar: 2,
 *  snafu: {
 *    foo: 3,
 *    baz: 4
 *  }
 * }
 *
 * 'foo'  // single property -> obj.foo
 * ['foo', 'bar']   // property list -> obj.foo, obj.bar
 * [['snafu', 'foo']]   // property path -> obj.snafu.foo
 * ````
 *
 * @typedef {string|Array.<string|string[]>} PropsList
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
 * ````js
 * {
 *   'file(s) to watch': 'file(s) to rebuild'
 * }
 * ````
 *
 * ````js
 * {
 *   'templates/*': '*', // every templates changed will trigger a rebuild of all files
 * }
 * ````
 *
 * @typedef {Object} PathsObject
 * @property {Glob|string} - A `glob` or `string` map specifying which other files should run through the pipeline.
 */
