var liveDbMongo = require('livedb-mongo');
var redis = require('redis').createClient();
var racer = require('racer');

redis.select(process.env.REDIS_DB || 1);
var store = racer.createStore({
  db: liveDbMongo('localhost:27017/project?auto_reconnect', {safe: true}),
  redis: redis
});


var model = store.createModel();

model.on('change', function(value) {
  console.log('change: ' + value);
});

var obj = {
  'name': 'datatest.js ' + new Date().toDateString(),
  'note': 'datatest.js note ' + new Date().toDateString(),
  'userId': '74af8a0d-4c4d-4fe3-b3d2-29983469bd3f'
};

model.add('items', obj);
