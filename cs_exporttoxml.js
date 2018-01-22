/**
* @NApiversion 2.x
* @NScriptType ClientScript
*/

define(['N/redirect', 'N/record'], function(redirect, record){

	function triggerXML(){
		redirect.toSuitelet({
		    scriptId: 31 ,
		    deploymentId: 1,
		    parameters: {'custparam_test':'helloWorld'} 
		});
	}

	return {
		triggerXML : triggerXML
	}

});