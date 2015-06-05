(function (credentials, helpers) {
  var exports = {};
  
  /* Data Feed Function */
  exports.methodA1 = function (params) {
    var url = 'http://example.api/methodA1?api_key_var_name=' + credentials.apiKey;
    return $.ajax({url: url});
  };
  
  exports.methodA1User = function(params) {
    var url = 'http://example.api/methodA1/user/' + params.UserId;
    delete params.UserId;
    if (params) url = url + '?' + $.param(params);
    return $.ajax({url: url, type: 'GET'});
  };
  
  /* OAuth Functions */
  exports.methodA1Authenticate = function(params) {
    // var implicitUrl = 'https://www.exampleurl.com/auth?';
    var url = {
      codeUrl: 'https://www.exampleurl.com/auth?',
      tokenUrl: 'https://www.exampleurl.com/access_token?'
    };
    
    //parameters will vary from service to service
    /* var = implicitParams {
      client_id: credentials.apiKey,
      redirect_uri: params.redirect_uri,
      response_type: params.response_type
    } */
    var urlParams = {
      code: {
        client_id: credentials.apiKey,
        redirect_uri: params.redirect_uri,
        response_type: params.response_type
      },
      token: {
        client_secret: credentials.apiSecret,
        grant_type: 'authorization_code'
      }
    };
    
    //helper oauth functions return access token. check to see if service uses authentication code or implicit oauth
    //return helpers.oauth2Implicit(implicitUrl, implicitParams)
    return helpers.oauth2AuthCode(url, urlParams)
    .then(function(token){
      var db = window.localStorage;
      //'service_access_token' should be unique to each service so that multiple authenticated services can be used
      db.setItem('service_access_token', token);
      return token;
    })
    .fail(function(err){
      console.log(err);
    });
  };
  
  exports.authenticatedMethodA1 = function(params){
    var token = window.localStorage.getItem('service_access_token')
    if (!token) return 'Need access token before making call';
    
    var urlParams = $.extend({access_token: token}, params);
    var completeUrl = 'https://api.example.com/call?' +  $.param(urlParams);
    return $.ajax({
      url: completeUrl,
      type: 'GET',
      dataType: 'json'})
    .then(function(response){
      return response;
    })
    .fail(function(err){
      return err.responseText;
    });
  };
  
  return exports;
})