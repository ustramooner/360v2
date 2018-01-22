/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       20 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function wf_triggerduedate_prog() {

	// calling single po scheduled script
	nlapiLogExecution('DEBUG','TRIGGER DUE DATE', 'Update DueDate of Vendor Bill program');
	status = nlapiScheduleScript('customscript_duedate_prog', null);
	
}
