/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       04 May 2016     yonghyk
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 *   
 * @param {String} type Operation types: create, edit, view, copy, print, email
 * @param {nlobjForm} form Current form
 * @param {nlobjRequest} request Request object
 * @returns {Void}
 */
function BeforeLoad_add_btn(type, form, request){
if (type != 'view') return;
	
	var link1 = '/app/site/hosting/scriptlet.nl?script=179&deploy=1&vcid=' + nlapiGetRecordId();
	var link2 = '/app/site/hosting/scriptlet.nl?script=173&deploy=1&vcid=' + nlapiGetRecordId();
	var link3 = '/app/site/hosting/scriptlet.nl?script=171&deploy=1&vcid=' + nlapiGetRecordId();
	form.addButton('custpage_email', 'Print Vendor Credit PDF', "window.open('"+ link1 +"')"); 
	form.addButton('custpage_email', 'Email Vendor Credit PDF', "window.open('"+ link2 +"')"); 
	form.addButton('custpage_email', 'Print test original Vendor Credit PDF', "window.open('"+ link3 +"')"); 

}
