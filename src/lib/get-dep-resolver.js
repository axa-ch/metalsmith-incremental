import path from 'path'
import isRegex from 'is-regex'

const depResolverDefault = {
  pug: /(?:include|extends)\s+([^\s]+)/mg,
}

/**
 * Finds the approbiate dependency resolver for a given file extension.
 *
 * **Support File Extensions (by default)**
 * * .pug, .jade
 *
 * @private
 * @param {string} file - The path of the current file.
 * @param {RegExp|DependencyResolver|DependencyResolverMap} [depResolver] - A custom dependency resolver to use.
 * @returns {RegExp|DependencyResolver} - Returns a concrete dependency resolver.
 */
const getDepResolver = (file, depResolver) => {
  const type = typeof depResolver

  if (type === 'function'
    // eslint-disable-next-line no-param-reassign
    || (type === 'string' && (depResolver = new RegExp(depResolver, 'gm')))
    || isRegex(depResolver)) {
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

  if (type === 'object') {
    let depResolverProp = depResolver[key]
    const propType = typeof depResolverProp

    if (propType === 'function'
      // eslint-disable-next-line no-param-reassign
      || (propType === 'string' && (depResolver[key] = (depResolverProp = new RegExp(depResolverProp, 'gm'))))
      || isRegex(depResolverProp)) {
      return depResolverProp
    }
  }

  return depResolverDefault[key]
}

export default getDepResolver
