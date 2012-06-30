/*!
 * redis-monitor
 * Copyright(c) 2012 Daniel D. Shaw <dshaw@dshaw.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var util = require('util')
  , EventEmitter = require('events').EventEmitter
  , redis = require('redis')
  , sia = require('socket.io-announce')
  , uuid = require('node-uuid')

/**
 * Configuration.
 */

var defaults = {
      monitor: false
    , debug: false
    , room: 'rti'
    , interval: 10*1000
    }
  , logger = console
  , debug = function noop () {}

/**
 * Exports.
 */

module.exports = RedisMonitor

/**
 * Redis Monitor
 *
 * @param options
 * @return {RedisMonitor}
 * @constructor
 */

function RedisMonitor (options) {
  if (!(this instanceof RedisMonitor)) { return new RedisMonitor(options) }

  options || (options = {})

  Object.keys(defaults).forEach(function (def) {
    if (!options[def]) options[def] = defaults[def]
  })

  if (options.logger) options.logger = require(options.logger)
  if (options.debug) debug = console.log

  this.options = options
  debug(options)

  var self = this;

  this.waiting = 2 // wait until both the monitorClient and announceClient are ready
  this.lastUpdate = null
  this.updates = 0

  // Realtime info
  this.rti = {
      name: options.name || 'rti:' + uuid.v4()
    , room: options.room
    , interval: options.interval
    , info: {}
  }

  // Realtime info methods (exposed for tests)
  this.rtim = {
      parseChanges: parseChanges
    , parseInfo: parseInfo
  }

  // Client that polls monitored redis instance
  this.monitorClient = redis.createClient(options.port, options.host, options)

  this.monitorClient.once('ready', function onMCReady () {
    debug("monitorClient ready")
    self.emit('ready')
  })

  // Socket.io-Announce
  this.announce = sia({
    pub: {
      port: options.annport || options.port,
      host: options.annhost || options.host
    }
  })

  // Socket.io-Announce redis client
  this.announceClient = this.announce.pub

  this.announceClient.once('ready', function onAnnounceReady () {
    debug("announceClient ready")
    self.emit('ready')
  })

  // Apply realtime info info
  this.on('rti', function _onRti (rti) {
    self.announceClient.set(self.rti.name, JSON.stringify(rti), debug);
    self.announceClient.sadd('rti:list', self.rti.name, debug)
    self.announce.in(self.rti.room).emit('rti:new', rti)
  })

  // Announce update deltas
  this.on('update', function (update) {
    self.announce.in(self.rti.room).emit(self.rti.name+':update', update)
  })

  // Debug logging
  if (options.debug) {
    this.on('update', function (update) {
      debug('update', update)
    })
  }

  // Polling interval
  this.on('ready', function () {
    self.waiting--;
    if (!self.waiting) {
      function getInfo () {
        self.monitorClient.info(self._updateInfo.bind(self))
      }
      getInfo()
      self.rti.intervalId = setInterval(getInfo, self.rti.interval)
    }
  })
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(RedisMonitor, EventEmitter);

/**
 * Update Info and emit changes.
 *
 * @param err
 * @param infoStr
 * @return {*}
 * @private
 */

RedisMonitor.prototype._updateInfo = function (err, infoStr) {
  if (err) return logger.error(err)

  var info = parseInfo(infoStr)
    , changes = parseChanges(this.rti.info, info)

  this.rti.info = info

  if (!this.initialized) {
    this.emit('rti', this.rti)
    this.initialized = true
    this.lastUpdate = Date.now()
    this.updates++;
  }

  if (changes && Object.keys(changes).length) {
    this.emit('update', changes)
    this.lastUpdate = Date.now()
    this.updates++;
  }
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
