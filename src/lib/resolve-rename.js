import path from 'path'

/**
 * Takes a file path, executes the supplied rename method and returns the renamed path.
 *
 * @private
 * @param {string} file - The file path which may got renamed.
 * @param {RenameObject|RenameFunction} rename - The method used to resolve renaming of `file`.
 * @returns {string} - Returns the renamed path.
 */
const resolveRename = (file, rename) => {
  const renameIsFunc = typeof rename === 'function'
  const renameIsRegex = !renameIsFunc && typeof rename === 'object' && rename.from && rename.to
  let renamedFile = file

  if (renameIsFunc) {
    const extname = path.extname(renamedFile)
    const renamed = rename({
      dirname: path.dirname(renamedFile),
      basename: path.basename(renamedFile, extname),
      ext: extname,
    })

    renamedFile = path.join(renamed.dirname, `${renamed.basename}${renamed.ext}`)
  } else if (renameIsRegex) {
    renamedFile = renamedFile.replace(rename.from, rename.to)
  }

  return renamedFile
}

export default resolveRename
