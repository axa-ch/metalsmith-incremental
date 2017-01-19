import chalk from 'chalk'

const log = (message) => {
  console.log(`[${chalk.green('metalsmith-incremental')}] ${message}`)
}

export default log
