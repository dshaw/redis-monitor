/*!
 * redis-monitor
 * Copyright(c) 2012 Daniel D. Shaw <dshaw@dshaw.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var path = require('path')
  , optimist = require('optimist')
  , sio = require('socket.io')
  , tako = require('tako')
  , RedisMonitor = require('./redis-monitor')

/**
 * Configuration.
 */

var options = optimist.default({ httpport: 8888, announce: true }).argv
  , redisMonitor = RedisMonitor(options)
  , client = redisMonitor.announceClient
  , redisStore = new sio.RedisStore({ nodeId: function () { return options.nodeid } })
  , app = tako({ socketio: sio })
  , debug = (options.debug) ? console.log : function noop () {}

/**
 * Socket.io.
 */

app.socketioManager.configure(function () {
  app.socketioManager.set('store', redisStore)
})

app.sockets.on('connection', function (socket) {
  // join the "rti" room to get announce broadcasts.
  socket.join(redisMonitor.rti.room)

  rtiList(socket, client, function () {})

  socket.on('list', function () {
    rtiList(socket, client)
  })

  socket.on('rti:info', function (name) {
    debug('rti:info received', name)

    client.get(name, function (err, info) {
      if (err) return console.error(err)

      debug('get info', err, info)
      socket.emit(name, JSON.parse(info))
    })
  })
})

/**
 * App.
 */

app.route('/').files(path.join(__dirname, 'public'))  // WTF, Tako?
app.route('/*').files(path.join(__dirname, 'public'))

app.httpServer.listen(options.httpport, function onListening () {
  var address = app.httpServer.address()
  console.log('Server listening on %s:%d', (address.address == '0.0.0.0') ? 'localhost' : address.address, address.port)
})


/**
 * RTI List
 *
 * @param socket
 * @param client
 */

function rtiList (socket, client, callback) {
  client.smembers('rti:list', function (err, res) {
    if (err) return console.error(err)

    socket.emit('rti:list', res)

    if (callback) callback()
  })
}
