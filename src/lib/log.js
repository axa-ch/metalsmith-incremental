import chalk from 'chalk'

/**
 * Logs coloured output to console.
 *
 * @private
 * @param {string} [message] - Any message which should be logged.
 */
const log = (message) => {
  console.log(`[${chalk.green('metalsmith-incremental')}] ${message}`)
}

export default log
