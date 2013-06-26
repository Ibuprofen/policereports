var liveDbMongo = require('livedb-mongo'),
    redis = require('redis').createClient(),
    racer = require('racer'),
    util = require('util'),
    request = require('request'),
    _ = require('underscore'),
    xml2js = require('xml2js'),
    parser = new xml2js.Parser({ attrkey: '_', explicitArray: false }),
    EventEmitter = require('events').EventEmitter,
    events = new EventEmitter(),
    saved = 0;

// couple of helpers
var error = function (arg) { console.log(arg); };
var exit = function(status, message) {
  status = status || 0;
  if (message) { console.log(message); }
  process.exit(status);
};

// set us up the stores
redis.select(process.env.REDIS_DB || 1);
// Get Mongo configuration
var mongoUrl = process.env.MONGO_URL || process.env.MONGOHQ_URL ||
  'mongodb://localhost:27017/policereports';

// The store creates models and syncs data
var store = racer.createStore({
  db: liveDbMongo(mongoUrl + '?auto_reconnect', {safe: true}),
  redis: redis
});
var model = store.createModel();

// our json object is ready weooo
events.once('data:parse', function (incidents) {
  // reports from the feed
  var allIncidentIds = [];
  incidents.forEach(function(source) {
    allIncidentIds.push(source.incidentid);
  });

  // reports already in the database
  var knownIncidentIds = [];
  var reportQuery = model.query('reports',{ incidentid: { $in: allIncidentIds }});
  reportQuery.fetch(function(err) {
    if (err) error(err);

    // actually run the query
    var results = reportQuery.get();

    // so we can compute difference
    results.forEach(function (result) {
      knownIncidentIds.push(result.incidentid);
    });

    // filter out the reports we already have
    var newIncidentIds = _.difference(allIncidentIds, knownIncidentIds);
    console.log('newIncidentIds (number of new reports):', newIncidentIds.length);

    // nothing to insert
    if (newIncidentIds.length === 0) {
      exit(0, 'Nothing to do');
    }

    // insert the new reports
    newIncidentIds.forEach(function (id) {
      // we need the whole object
      var incident = _.find(incidents, function (obj) {
        return (obj.incidentid === id) || false;
      });
      model.add('reports', incident, function (err) {
        if (err) error(err);
        console.log('added: ', incident.incidentid);
        events.emit('data:save', newIncidentIds.length);
      });
    });
  });

  // exit process when we're done inserting everything
  events.on('data:save', function (limit) {
    saved++;
    if (saved === limit) exit(0, 'All done');
  });
});

// add additional attributes to each report
var dataSetup = function (xml, json) {
  var objs = [];

  // iterate over each report and setup attributes
  json.feed.entry.forEach(function (report) {
    // our own attributes
    var attributes = {
      incidentid: report.id.split('/')[1],
      feedid: report.id,
      latitude: report['georss:point'].split(' ')[0],
      longitude: report['georss:point'].split(' ')[1]
    };
    // extend the report with our new attributes
    _.extend(report, attributes);
    delete report.id; // let racer handle the id generation

    objs.push(report);
  });

  return objs;
};


// request feed
// http://www.portlandonline.com/cgis/metadata/viewer/display.cfm?Meta_layer_id=53215&Db_type=sde&City_Only=False

//request('http://localhost/911incidents.cfm', function (error, response, body) {
request('http://www.portlandonline.com/scripts/911incidents.cfm', function (error, response, body) {
  if (error) { error(error); }
  if (!error && response.statusCode == 200) {
    parser.addListener('end', function(json) {
      // pass on the json object
      events.emit('data:parse', dataSetup(body, json));
    });
    parser.parseString(body); // xml to json
  }
  // show something
  if (!error && response.statusCode !== 200) { console.log('Status: ' + response.statusCode); }
});
