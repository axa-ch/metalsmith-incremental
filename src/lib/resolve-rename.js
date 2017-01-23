import path from 'path'

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
