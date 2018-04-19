/**
*@NApiVersion 2.x
*@NScriptType Suitelet
*@NModuleScope SameAccount
*/
define(function(){
var https = require('N/https')
response = https.put({
  url : url + urlComponent + '/' + payload.website_item,
  body : JSON.stringify(payload),
  headers : {
    'Accept' : 'application/json',
    'Location' : 'application/json',
    'Authorization' : 'OAuth2 ' + base64EncodedToken
  }
});
})
