import path from 'path'
import isRegex from 'is-regex'

const reDepHash = {
  pug: /include\s+([^\s]+)/mg,
}

const getDepCheck = (file, reDep) => {
  if (!isRegex(reDep)) {
    return reDep
  }

  const extension = path.extname(file)
  let key

  switch (extension) {
    case '.jade':
      key = 'pug'
      break

    default:
      key = extension.splice(1)
  }

  if (typeof reDep === 'object' && (typeof reDep[key] === 'function' || isRegex(reDep[key]))) {
    return reDep[key]
  }

  return reDepHash[key]
}

export default getDepCheck
