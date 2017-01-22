import path from 'path'
import isRegex from 'is-regex'

const depResolverDefault = {
  pug: /(?:include|extends)\s+([^\s]+)/mg,
}

const getDepResolver = (file, depResolver) => {
  if (typeof depResolver === 'function' || isRegex(depResolver)) {
    return depResolver
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

  if (typeof depResolver === 'object' &&
    (typeof depResolver[key] === 'function' || isRegex(depResolver[key]))) {
    return depResolver[key]
  }

  return depResolverDefault[key]
}

export default getDepResolver
