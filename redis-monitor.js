#!/usr/bin/env node
/*!
 * redis-monitor
 * Copyright(c) 2012 Daniel D. Shaw <dshaw@dshaw.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var optimist = require('optimist')
  , redis = require('redis')
  , uuid = require('node-uuid')
  , sioann = require('socket.io-announce')

/**
 * Configuration.
 */

var defaults = {
      announce: false
    , monitor: false
    , debug: false
    , room: 'rti'
    , interval: 10*1000
    }
  , options = {}
  , client = null
  , announce = null
  , logger = console
  , debug = function noop () {}
  , lastUpdate = null
  , updates = 0

/**
 * Exports.
 */

if(!module.parent) {
  // Not imported as a module. Run monitor.
  options = optimist.default(defaults).argv
  options.required = false
  createClient(options)
} else {
  module.exports = createClient
}


/**
 * Create Redis Monitor Client.
 *
 * @param opts
 * @return {*}
 */

function createClient (opts) {
  opts || (opts = {})

  if (typeof opts.required === 'undefined' || opts.required !== false) {
    Object.keys(defaults).forEach(function (def) {
      if (!options[def]) options[def] = defaults[def]
    })
    Object.keys(opts).forEach(function (def) {
      options[def] = opts[def]
    })
  }

  client = redis.createClient(options.port, options.host, options)
  announce = sioann.createClient(options.annport || options.port, options.annhost || options.host, options)

  if (options.logger) options.logger = require(options.logger)
  if (options.debug) debug = console.log

  /**
   * RTI.
   */

  // realtime info
  client.rti = {
    name: options.name || 'rti:' + uuid.v4()
  , room: options.room
  , interval: options.interval
  , info: {}
  }

  // realtime info methods (exposed for tests)
  client.rtim = {
    parseChanges: parseChanges
  , parseInfo: parseInfo
  }

  client.on('rti', function _onRti (rti) {
    client.set(client.rti.name, JSON.stringify(rti));
    client.sadd('rti:list', client.rti.name)
  })

  /**
   * INFO status interval.
   */

  _handleInterval()
  client.rti.intervalId = setInterval(_handleInterval, client.rti.interval)

  /**
   * Socket.io announce.
   */

  if (options.announce) {
    client.on('rti', function _onRti (rti) {
      announce.in(options.room).emit('rti:new', rti)
    })
    client.on('update', function (update) {
      debug(options.room, update)
      announce.in(options.room).emit(client.rti.name+':update', update)
    })
  }

  /**
   * Monitor - use with extreme caution (http://redis.io/commands/monitor).
   */

  if (options.monitor) {
    client.monitor(function (err, res) {
      if (err) return logger.error(err)
      debug('Entering monitoring mode.')
    })

    client.on('monitor', function (time, args) {
      if (args[0] !== 'info') {
        var intervalSec = client.rti.interval/1000
          , delta = Math.round(time) - Math.round(lastUpdate/1000) // seconds

        if (!lastUpdate || delta > intervalSec) {
          client.info(_updateInfo)
        }
      }
    })
  }

  /**
   * Debug logging.
   */

  if (options.debug) {
    client.on('update', function (update) {
      debug('update', update)
    })
  }

  return client
}


/**
 * RTI methods.
 */

/**
 * Parse Changes.
 *
 * @param oldInfo
 * @param newInfo
 * @return {Object}
 */

function parseChanges (oldInfo, newInfo) {
  return Object.keys(newInfo).reduce(function (acc, x) {
    if (!oldInfo[x] || oldInfo[x] !== newInfo[x]) {
      acc[x] = newInfo[x]
    }
    return acc
  }, {})
}

/**
 * Parse node_redis INFO output string.
 *
 * @param info
 * @return {Object}
 */

function parseInfo (info) {
  return info.toString().split('\r\n').reduce(function (acc, x) {
    var kv = x.split(':')
    if (kv[1]) acc[kv[0]] = kv[1]
    return acc
  }, {})
}

/**
 * Interval handler.
 *
 * @private
 */
function _handleInterval () {
  client.info(_updateInfo)
}

/**
 * Update Info and emit changes.
 *
 * @param err
 * @param infoStr
 * @return {*}
 * @private
 */

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
