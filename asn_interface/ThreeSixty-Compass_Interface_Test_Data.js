/**
 * Module Description
 *
 * Version Date Author Remarks 1.00 9 Mar 2016 HUNTER MACLEAN
 *
 */

function interfaceTest() {
	try {
		var stErrMsg = '';
		var xmlDoc = nlapiGetFieldValue('custrecord_xml_doc');
		var xmlData = '';
		
		//Get the XML String from the Request
		if(xmlDoc){
			var xmlFile = nlapiLoadFile(xmlDoc); // Load XML doc
			xmlData = xmlFile.getValue(); // Get file data
		}
		else{
			xmlData = nlapiGetFieldValue('custrecord_test_data');
		}

		var url = 'https://forms.na2.netsuite.com/app/site/hosting/scriptlet.nl?script=204&deploy=1&compid=ACCT33375&h=64ecd001defeefe19245';
		var headers = new Array();
		headers['Content-Type'] = 'application/xml;charset=UTF-8';
		headers['Accept'] = 'application/soap+xml,application/json, application/dime, multipart/related, text/*';

		var response = nlapiRequestURL(url, xmlData, headers);
		nlapiLogExecution('DEBUG', 'Response', response.getCode());
		var errors = (response.getError()) ? response.getError() : 'No Errors.'
		nlapiLogExecution('DEBUG', 'Error', errors);		
	} catch (e) {

		var stErrMsg = '';

		if (e.getDetails != undefined){

			stErrMsg = 'Error Message : \r\n' + e.getCode() + '\r\n' + e.getDetails();
			nlapiLogExecution('Error', 'stErrMsg ', stErrMsg);
		}

		else{

			stErrMsg = 'Error Message : \r\n' + e.toString();
			nlapiLogExecution('Error', 'stErrMsg ', stErrMsg);
		}

		var usage = nlapiGetContext().getRemainingUsage();
		nlapiLogExecution('DEBUG', 'Remaining Usage ', usage);
	}
}