/*!
 * redis-monitor
 * Copyright(c) 2012 Daniel D. Shaw <dshaw@dshaw.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var optimist = require('optimist')
  , RedisMonitor = require('./redis-monitor')

/**
 * Configuration.
 */

var options = optimist.argv
  , redisMonitor = RedisMonitor(options)
