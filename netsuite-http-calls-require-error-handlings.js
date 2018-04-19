define([
'blah', 'N/https'
],
function(blah, https) {
response = https.put({
    url : url + urlComponent + '/' + payload.website_item,
    body : JSON.stringify(payload),
    headers : {
        'Accept' : 'application/json',
        'Content-Type' : 'application/json',
        'Authorization' : 'OAuth2 ' + base64EncodedToken
    }
});
})
