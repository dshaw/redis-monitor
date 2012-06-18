#!/usr/bin/env node

var util = require('util')
  , redis = require('redis')
  , uuid = require('node-uuid')
  , defaults = { monitor: true,  debug: true, interval: 10*1000 }
  , options = require('optimist').default(defaults).argv
  , client = redis.createClient(options.port, options.host, options)
  , logger = options.logger ? require(options.logger) : console
  , debug = options.debug ? console.log : function noop () {}
  , cdir = console.dir
  , lastUpdate = null
  , updates = 0

try {
  cdir = require('cdir') // try to use `cdir` if it's available.
} catch (err) {}

client.rti = {
  name: options.name || 'rti' + uuid.v4()
, interval: options.interval
, info: {}
}

_handleInterval()
client.rti.intervalId = setInterval(_handleInterval, client.rti.interval)

if (options.monitor) {
  client.monitor(function (err, res) {
    if (err) return logger.error(err)
    logger.log('Entering monitoring mode.')
  })

  client.on('monitor', function (time, args) {
    if (args[0] !== 'info') {
      var intervalSec = client.rti.interval/1000
        , delta = Math.round(time) - Math.round(lastUpdate/1000) // seconds

      logger.log('monitor', args, Math.round(time), delta, delta > intervalSec, intervalSec, updates)

      if (!lastUpdate || delta > intervalSec) {
        client.info(_updateInfo)
      }
    }
  })
}

if (options.debug) {
  client.on('update', function (update) {
    logger.log('update', update)
    logger.log()
  })
}

function parseChanges (oldInfo, newInfo) {
  return Object.keys(newInfo).reduce(function (acc, x) {
    if (!oldInfo[x] || oldInfo[x] !== newInfo[x]) {
      acc[x] = newInfo[x]
    }
    return acc
  }, {})
}

function parseInfo (info) {
  var infoLines = info.toString().split("\r\n")

  return infoLines.reduce(function (acc, x) {
    var kv = x.split(':')
    if (kv[1]) acc[kv[0]] = kv[1]
    return acc
  }, {})
}


function _handleInterval () {
  var delta = Date.now() - lastUpdate // ms

  logger.log('interval', delta, delta > client.rti.interval)

  if (delta > client.rti.interval) {}

  client.info(_updateInfo)
}

function _updateInfo (err, infoStr) {
  if (err) return logger.error(err)

  var info = parseInfo(infoStr)
    , changes = parseChanges(client.rti.info, info)

  client.rti.info = info

  if (!client.rti.initialized) {
    client.emit('rti', client.rti)
    client.rti.initialized = true
  }

  if (changes && Object.keys(changes).length) {
    client.emit('update', changes)
    lastUpdate = Date.now()
    updates++
  }
}
