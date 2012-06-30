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
  , options = {}
  , logger = console
  , debug = function noop () {}
  , lastUpdate = null
  , updates = 0

/**
 * Exports.
 */

module.exports = RedisMonitor

/**
 * Create Redis Monitor Client.
 *
 * @param opts
 * @return {*}
 */

function RedisMonitor (opts) {
  if (!(this instanceof RedisMonitor)) { return new RedisMonitor(opts) }

  this.waiting = 2 // wait until both the monitorClient and announceClient are ready

  var self = this;

  opts || (opts = {})

  if (typeof opts.required === 'undefined' || opts.required !== false) {
    Object.keys(defaults).forEach(function (def) {
      if (!options[def]) options[def] = defaults[def]
    })
    Object.keys(opts).forEach(function (def) {
      options[def] = opts[def]
    })
  }

  if (options.logger) options.logger = require(options.logger)
  if (options.debug) debug = console.log

  debug(options)
  this.options = options

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
    self.emit('ready')
  })

  // Apply realtime info info
  this.on('rti', function _onRti (rti) {
    self.announceClient.set(self.rti.name, JSON.stringify(rti), redis.print);
    self.announceClient.sadd('rti:list', self.rti.name, redis.print)
    self.announce.in(options.room).emit('rti:new', rti)
  })

  // Announce update deltas
  this.on('update', function (update) {
    self.announce.in(options.room).emit(self.rti.name+':update', update)
  })

  /**
   * Monitor - use with extreme caution (http://redis.io/commands/monitor).
   */

  if (false && options.monitor) { // taking monitor off the table for now
    // create a new redis client since monitor mode is one of the special modes
    var mc = this.monitorClient = redis.createClient(options.port, options.host, options)
      , monitorCache = []

    mc.monitor(function (err, res) {
      if (err) return logger.error(err)
      debug('Entering monitoring mode.')
    })

    mc.on('monitor', function (time, args) {
      if (args[0] !== 'info') {
        var intervalSec = self.rti.interval/1000
          , delta = Math.round(time) - Math.round(lastUpdate/1000) // seconds

        monitorCache.push(args)

        if (!lastUpdate || delta > intervalSec) {
          self._updateMonitor(monitorCache, function (err) {
            if (!err) monitorCache = []
          })
        }
      }
    })
  }

  /**
   * Debug logging.
   */

  if (options.debug) {
    this.on('update', function (update) {
      debug('update', update)
    })
  }

  this.on('ready', function () {
    self.waiting--;
    console.log('waiting', self.waiting)
    if (!self.waiting) {
      function _handleInterval () {
        self.monitorClient.info(self._updateInfo.bind(self))
      }

      _handleInterval()
      self.rti.intervalId = setInterval(_handleInterval, self.rti.interval)
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

  if (!this.rti.initialized) {
    this.emit('rti', this.rti)
    this.rti.initialized = true
  }

  if (changes && Object.keys(changes).length) {
    this.emit('update', changes)
    lastUpdate = Date.now()
    updates++;
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
