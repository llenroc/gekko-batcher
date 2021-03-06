require('events').EventEmitter.defaultMaxListeners = 1000
const util = require('./core/util.js')
const configsGenerator = require(util.dirs().tools + '/configsGenerator')
const resultsHandler = require(util.dirs().tools + '/resultsHandler')
const info = require(util.dirs().core + '/info')
const async = require('async')
const axios = require('axios')
const csv = require('fast-csv')
const fs = require('fs')
const _ = require('lodash')
const marky = require('marky')
const uniqid = require('uniqid')

util.createResultsFolder()
util.mode = 'bruteforce'

let ranges = configsGenerator.generateRangesOfMethod()
let combs = configsGenerator.getAllCombinationsFromRanges(ranges)
let strategyConfigs = configsGenerator.generateAllBruteforceCombinations(combs)
let gekkoConfigs = configsGenerator.prepareAllConfigsForGekko(strategyConfigs)
let fileName = util.generateFileName()

info.initMessage(gekkoConfigs.length)

const csvStream = csv.createWriteStream({ headers: true })
const writableStream = fs.createWriteStream(`${util.dirs().results}/${fileName}`)

csvStream.pipe(writableStream)

async.mapLimit(gekkoConfigs, util.config.parallelQueries, runBacktest, (err) => {
  if (err) throw err

  csvStream.end()

  info.finishMessage(fileName)
})

async function runBacktest (config) {
  info.startedBacktest(config)
  info.completedBacktests++

  let backtestId = info.completedBacktests + '_' + uniqid()

  marky.mark(backtestId)

  try {
    await axios.post(`${util.config.apiUrl}/api/backtest`, config).then((response) => {
      let row = {}

      let performanceReport = response.data.performanceReport

      if (!_.isEmpty(performanceReport)) {
        info.successfulBacktests++

        row = resultsHandler.prepareCsvRow(response.data)
        info.spentTime += marky.stop(backtestId).duration
        info.completeBacktest(config)

        csvStream.write(row)
      } else {
        info.failureBacktests++
        info.spentTime += marky.stop(backtestId).duration
        info.withoutTrades(config)
      }

      info.processInfo()
    })
  } catch (err) {
    util.errorHandler(err)

    info.errorInMethod(config)
    info.failureBacktests++
    info.spentTime += marky.stop(backtestId).duration
  }
}
