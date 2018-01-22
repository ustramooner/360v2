/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       22 Aug 2016     oneconsulting
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function wf_triggerbillcredit_autoapply() {

	
	nlapiLogExecution ('DEBUG', 'TRIGGER BILL CREDIT AUTO APPLY', 'Auto Apply Vendor Bill Credit');
	status = nlapiScheduleScript ('customscript_billcredit_autoapply', null);
}
