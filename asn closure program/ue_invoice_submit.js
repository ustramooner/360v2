/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       02 Feb 2017     yonghyk
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 * 
 * @param {String} type Operation types: create, edit, delete, xedit,
 *                      approve, cancel, reject (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF only)
 *                      dropship, specialorder, orderitems (PO only) 
 *                      paybills (vendor payments)
 * @returns {Void}
 */
function ue_invoice_submit(type){
	var recId = nlapiGetRecordId();
	var inv_subsidiary = nlapiGetFieldValue('subsidiary');
	if (inv_subsidiary != '6'){
		dLog('Call Sourcing Commission', 'Exist script since subsidiary is ' + inv_subsidiary);
        return null;
	}
  
  	var inv_asn = nlapiGetFieldValue('custbody_ts_rspo_related_asn');
	if (isEmpty(inv_asn)){
		dLog('Call Commission', 'Exit Script', 'Exit script since ASN is empty');
		return null;
	}
  
  	// Call Sales Commission

   // 	salescomm_calc(recId);
	dLog('Call Sales Commission', 'Processing Invoice |  id = ' + recId);
	dAudit('Call Sales Commission', 'Calling Sales Commission scheduled script..');
	var status2 = nlapiScheduleScript('customscript_ts2_salecomm_calc', null, {
			custscript_invoice2_id : recId
		});
	dLog('Call Sales Commission', 'Schedule Status = ' + status2);
  
    // Call Sourcing Commission
	dLog('Call Sourcing Commission', 'Processing Invoice |  id = ' + recId);
	var inv_searchRun = nlapiLoadSearch('transaction', 'customsearch_ts_inv_sourc_commission');
	inv_searchRun.addFilter(new nlobjSearchFilter('internalid', null, 'is', recId));
	var inv_resultSet = inv_searchRun.runSearch();
	nlapiLogExecution( 'debug', 'Prepare Report', "Number of lines to process:" + inv_resultSet.length);
	var inv_searchResults = inv_resultSet.getResults( 0, 1000 );
    if ( inv_searchResults.length > 0 && inv_searchResults != null ){
				dAudit('Call Sourcing Commission', 'Calling Single Sourcing Commission scheduled script..');
				status = nlapiScheduleScript('customscript_ts2_calc_single_sourc_comm', null, {
					custscript_invoice_id : recId
				});
    }
    else
    	nlapiLogExecution('debug','Call Sourcing Commission', 'search results returned: ' + inv_searchResults.length);
}
