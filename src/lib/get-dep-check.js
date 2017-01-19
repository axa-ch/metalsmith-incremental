import path from 'path'
import isRegex from 'is-regex'

const depCheckDefault = {
  pug: /include\s+([^\s]+)/mg,
}

const getDepCheck = (file, depCheck) => {
  if (typeof depCheck === 'function' || isRegex(depCheck)) {
    return depCheck
  }

  const extension = path.extname(file)
  let key

  switch (extension) {
    case '.jade':
      key = 'pug'
      break

    default:
      key = extension.slice(1)
  }

  if (typeof depCheck === 'object' &&
    (typeof depCheck[key] === 'function' || isRegex(depCheck[key]))) {
    return depCheck[key]
  }

  return depCheckDefault[key]
}

export default getDepCheck
