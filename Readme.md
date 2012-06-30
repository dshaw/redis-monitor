# Redis Monitor

Realtime Redis [INFO](http://redis.io/commands/info) monitoring

## Usage

    // monitor your local redis with socket.io-announce driven dashboard
    node server.js

    // broadcast redis monitoring data to realtime dashboard server
    node monitor.js --name redis-slave-1 --port 6380 --annport 6379

## Install

    npm install redis-monitor

## Usage

    var redisMonitor = require('redis-monitor')

    redisMonitor.on('rti', function (rti) {
      console.log('name', rti.name)
      console.log('info', rti.info)
    }

    redisMonitor.on('update', function (update) {
      console.log('update', update)
    }

## License

(The MIT License)

Copyright (c) 2012 Daniel D. Shaw, http://dshaw.com

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
