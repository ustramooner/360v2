/**
 * Module Description
 *
 * Version Date Author Remarks 1.00 9 Mar 2016 HUNTER MACLEAN
 *
 */

function interfaceReq(request, response) {
	//nlapiLogExecution('DEBUG', 'Method is: ', request.getMethod());
	try {
		var stErrMsg = '';

		//Get the XML String from the Request
		var data = request.getBody();
		var xmlData = nlapiStringToXML(data);
		var batchNode = nlapiSelectNode(xmlData, 'ROOT/ASN/BATCH_PROCESS_ID');
		var batchProcId = batchNode.firstChild.nodeValue;
		//nlapiLogExecution('DEBUG', 'Name is: ', request);
		if (data != null || data != '') { // REMOVED: data.getMethod() == 'POST'
			var date_time_value = nlapiDateToString(new Date(), 'datetimetz');
			var filename = batchProcId + '-' + date_time_value + '.xml';
			var file = nlapiCreateFile(filename, 'XMLDOC', data);
			file.setFolder('85');
			var fileId = nlapiSubmitFile(file);
			nlapiLogExecution('DEBUG', 'File ID', fileId);
		}

// Replicate code should be removed before migrating script to production
// Replicate data to ADE
//var url = 'https://forms.sandbox.netsuite.com/app/site/hosting/scriptlet.nl?script=208&deploy=1&compid=ACCT33375_SB2&h=3b67d541520a98d636c5';
//var resp = nlapiRequestURL(url, data);
//nlapiLogExecution('DEBUG', 'Replication Response', resp.getBody());

		var params = new Object();
		params['custscript_xml_doc'] = fileId;

		var deployName = '';
		var i = 1;
		var status = '';

		do{
			deployName = 'customdeploy_process_interface_data_' + i;
			status = nlapiScheduleScript('customscript_ts_process_data', deployName, params);
			nlapiLogExecution('DEBUG', 'Status', status);
			i++;
		} while(status != 'QUEUED');

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
		nlapiLogExecution('DEBUG', 'usage ', usage);
	}
}