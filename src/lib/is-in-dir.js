/**
 * Checks whether a distinct file path is within an array of directories.
 *
 * @private
 * @param {string} path - The path of the current metalsmith file.
 * @param {string[]} dirs - An array of directories to search for `path`.
 * @returns {boolean} - Returns `true` if the path was found inside one directory, else `false`.
 */
const isInDir = (path, dirs) => {
  for (let i = 0, l = dirs.length; i < l; i++) {
    if (dirs[i].indexOf(path) === 0) {
      return true
    }
  }

  return false
}

export default isInDir
