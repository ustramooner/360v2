/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       13 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */

function sourcing_commission_calc() {
	
	var batch_code = nlapiGetContext().getSetting('SCRIPT', 'custscript_tss_batchcode2');	
	nlapiLogExecution( 'debug', "Batch Code:" + batch_code);


	try {
		
		var filters = [];
		filters.push(new nlobjSearchFilter('custbody_asn_batch_code', null, 'is', batch_code));
		
		var ss_status = nlapiScheduleScript('customscript_calc_sourcing_commission', null, {
			custscript_calc_sourcing_commission : batch_code
		});
		nlapiLogExecution( 'debug', "Schedule Script Status:" + ss_status);

	} catch ( error ) {

		if ( error.getDetails != undefined ) {
			nlapiLogExecution( 'error', 'Process Error', error.getCode() + ":" + error.getDetails() );
		} else {
			nlapiLogExecution( 'error', 'Unexpected Error', error.toString() );
		}

	}

}
