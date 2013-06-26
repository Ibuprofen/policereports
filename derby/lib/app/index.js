var app = require('derby').createApp(module)
  .use(require('derby-ui-boot'))
  .use(require('../../ui'));

app.view.fn('addMarker', function(report) {
  console.log('addMarker', report.incidentid);
  var marker = '<script type="text/javascript">' +
      'new google.maps.Marker({ position: new google.maps.LatLng('+report.latitude+','+report.longitude+'), map: map, draggable: false, animation: google.maps.Animation.DROP, title: "Id: '+report.incidentid+'" });' +
      '</script>';
  return marker;
});

// ROUTES //

// Derby routes are rendered on the client and the server
app.get('/', function(page, model, params, next) {
  // Create a mongo query that gets the current user's items
  var itemsQuery = model.query('reports', {$orderby: { updated: -1 }, $limit: 50 });

  // Get the inital data and subscribe to any updates
  model.subscribe(itemsQuery, function(err) {
    if (err) return next(err);

    // Create references that can be used in templates or controller methods
    itemsQuery.ref('_page.reports');
    page.render('home');
  });
});

app.get('/reports', function(page, model, params, next) {
  // Create a mongo query that gets the current user's items
  var itemsQuery = model.query('reports', {$orderby: { updated: -1 } });

  // Get the inital data and subscribe to any updates
  model.subscribe(itemsQuery, function(err) {
    if (err) return next(err);

    // Create references that can be used in templates or controller methods
    itemsQuery.ref('_page.reports');

    page.render('reports');
  });
});

app.get('/list', function(page, model, params, next) {
  // This value is set on the server in the `createUserId` middleware
  var userId = model.get('_session.userId');

  // Create a scoped model, which sets the base path for all model methods
  var user = model.at('users.' + userId);

  // Create a mongo query that gets the current user's items
  var itemsQuery = model.query('items', {userId: userId, $orderby: { id : 1 } });

  // Get the inital data and subscribe to any updates
  model.subscribe(user, itemsQuery, function(err) {
    if (err) return next(err);

    // Create references that can be used in templates or controller methods
    model.ref('_page.user', user);
    itemsQuery.ref('_page.items');

    user.increment('visits');
    page.render('list');
  });
});

// CONTROLLER FUNCTIONS //

/*app.fn('report.add', function(e, el) {
  var newItem = this.model.del('_page.newItem');
  if (!newItem) return;
  this.model.add('reports', newItem);
});*/


app.fn('list.add', function(e, el) {
  var newItem = this.model.del('_page.newItem');
  if (!newItem) return;
  newItem.userId = this.model.get('_session.userId');
  this.model.add('items', newItem);
});

app.fn('list.remove', function(e) {
  var id = e.get(':item.id');
  this.model.del('items.' + id);
});
