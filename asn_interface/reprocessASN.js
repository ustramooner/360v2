/**
 * Module Description
 *
 * Version Date Author Remarks 1.00 9 Mar 2016 HUNTER MACLEAN
 *
 */

function reprocessASN(){
	try{
		var stErrMsg = '';
		var asnData = nlapiGetFieldValue('custrecord_asn_data');
		var url = 'https://forms.na2.netsuite.com/app/site/hosting/scriptlet.nl?script=208&deploy=1&compid=ACCT33375&h=320099135b42ae8798fd';

		var headers = new Array();
		headers['Content-Type'] = 'application/xml;charset=UTF-8';
		headers['Accept'] = 'application/soap+xml,application/json, application/dime, multipart/related, text/*';

		var response = nlapiRequestURL(url, asnData, headers);
		nlapiLogExecution('DEBUG', 'Response', response.getCode());
		var errors = (response.getError()) ? response.getError() : 'No Errors.'
		nlapiLogExecution('DEBUG', 'Error', errors);
	} catch (e){

		var stErrMsg = '';

		if(e.getDetails != undefined){

			stErrMsg = 'Error Message : \r\n' + e.getCode() + '\r\n' + e.getDetails();
			nlapiLogExecution('Error', 'stErrMsg ', stErrMsg);
		}

		else{

			stErrMsg = 'Error Message : \r\n' + e.toString();
			nlapiLogExecution('Error', 'stErrMsg ', stErrMsg);
		}

		var usage = nlapiGetContext().getRemainingUsage();
		nlapiLogExecution('DEBUG', 'usage ', usage);
	}
}
