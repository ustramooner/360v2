/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */


 define(['N/http', 'N/log'], 
 	function(http, log){

 	function beforeLoad(context){

 		var response = http.get({
 			url : 'http://localhost:49847/ftpservice.svc/helloworld/TestDdata'
 		});

 		log.debug(response.body);

 	}

 	return {
 		beforeLoad : beforeLoad
 	}

 });