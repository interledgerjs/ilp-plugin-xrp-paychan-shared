'use strict'

const ChannelWatcher = require('./lib/watcher')
const util = require('./lib/util')
const createSubmitter = require('./lib/tx-submitter')

module.exports = {
  util,
  ChannelWatcher,
  createSubmitter
}
