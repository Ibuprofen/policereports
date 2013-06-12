var util = require('util'),
    request = require('request'),
    _ = require('underscore'),
    xml2js = require('xml2js'),
    parser = new xml2js.Parser({attrkey: '_'}),
    mongoose = require('mongoose'),
    EventEmitter = require('events').EventEmitter,
    events = new EventEmitter(),
    incidents,
    saved = 0;

var liveDbMongo = require('livedb-mongo');
var redis = require('redis').createClient();
var racer = require('racer');

redis.select(process.env.REDIS_DB || 1);
var store = racer.createStore({
  db: liveDbMongo('localhost:27017/project?auto_reconnect', {safe: true}),
  redis: redis
});
var model = store.createModel();


var error = function (arg) { console.log(arg); };

var exit = function(status) {
  status = status || 0;
//  process.exit(status);
};

// add additional attributes to each report
var dataSetup = function (xml, json) {
  //console.log(util.inspect(json.feed.entry, false, null));

  var objs = [];

  // iterate over each report and setup attributes
  json.feed.entry.forEach(function (report) {
    var attributes = {
      _incidentid: report.id.toString().split('/')[1],
      _lat: report['georss:point'].toString().split(' ')[0],
      _long: report['georss:point'].toString().split(' ')[1]
    };
    // extend the report with our new attributes
    entry = _.extend(report, attributes);

    objs.push(entry);
  });

  events.emit('data:ready');

  return objs;
};

var mongoStuffs = function () {
  var reportSchema = mongoose.Schema({
    'id': String,
    'title': String,
    'updated': { type: Date },
    'summary': String,
    'category': String,
    'published': { type: Date },
    'georss:point': String,
    'content': String,
    '_incidentid': String,
    '_lat': String,
    '_long': String
  });
  reportSchema.set('autoIndex', false);

  var Report = mongoose.model('Report', reportSchema);

  // query time
  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'connection error:'));
  db.once('open', function () {

    var forInsert = [];

    console.log('db open');

    events.on('report:save', function (saveLength) {
      saved++;
      // when we hit x number of saves, exit
      if (saved === saveLength) {
        mongoose.disconnect();
        console.log('all done saving, exiting');
        exit();
      }
    });

    var incidentIds = [];
    incidents.forEach(function(source) {
      incidentIds.push(source._incidentid);
    });

    // attempt to query for all reports, diff will show what to insert as new
    Report.find({ _incidentid: { $in: incidentIds } }, function (err, results) {
      if (err) { error(err); }

      console.log('finished: ' + results.length);

      var saveLength = incidents.length - results.length;
      console.log('new reports: ' + saveLength);

      if (saveLength === 0) {
        mongoose.disconnect();
        console.log('no new reports');
        exit();
      } else {

        // group the ids that werent found
        var foundIds = [];
        results.forEach(function (result) {
          foundIds.push(result._incidentid);
        });
        console.log('incidentIds.length: ' + incidentIds.length);
        console.log('foundIds.length: ' + foundIds.length);
        var newIds = _.difference(incidentIds, foundIds);
        console.log('newIds.length: ' + newIds.length);

        // loop thru incidents, save if we dont have this report yet
        incidents.forEach(function (specific) {
          if (_.contains(newIds, specific._incidentid) === true) {
            Report(specific).save(function (err2, result2) {
              if (err2) { error(err2); }
              console.log('saved: ' + specific._incidentid);

var obj = {
  'name': specific.title,
  'note': specific.content,
  'userId': '74af8a0d-4c4d-4fe3-b3d2-29983469bd3f'
};

model.add('items', obj);

              events.emit('report:save', saveLength);
            });
          }
        });

      }

    }); // Report.find
  }); // db.once
};

// on json parsed, trigger queries by connecting database
events.once('data:ready', function () {
  mongoStuffs();
  // triggers mongo events
  mongoose.connect('mongodb://localhost/policereports');
});


// request feed
// http://www.portlandonline.com/cgis/metadata/viewer/display.cfm?Meta_layer_id=53215&Db_type=sde&City_Only=False

//request('http://localhost/911incidents.cfm', function (error, response, body) {
request('http://www.portlandonline.com/scripts/911incidents.cfm', function (error, response, body) {
  if (error) { error(error); }
  if (!error && response.statusCode == 200) {
    parser.addListener('end', function(json) {
      // populate global incidents object with json
      incidents = dataSetup(body, json);
    });
    parser.parseString(body); // xml to json
  }
  // show something
  if (!error && response.statusCode !== 200) { console.log('Status: ' + response.statusCode); }
});
