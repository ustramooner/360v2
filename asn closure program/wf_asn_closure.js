/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       13 Jul 2016     yonghyk
 *
 */



/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       09 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */

// name of ASN Saved Search: TS ONE ASN Closure to Process Search (DO NOT
// DELETE)
var SS_ASN2PROCESS = 'customsearch_asn_closure_to_process';
var LOG_NAME = 'processASN_Batch';

var CUST_BILLING_TYPE_AGENCY = 1;
// "Agency"
var CUST_BILLING_TYPE_PRINCIPAL = 2;
// "Principal"
var CUST_BILLING_TYPE_TRADING = 3;
// "Trading"

var SCRIPT_SINGLE_PO_ID = 'customscript_asn_single_po';
// TS730
var SCRIPT_COMP_PO_LOCAL_BILL_PER_DEL = 'customscript_comp_local_bill_dlvry';
// TS740
var SCRIPT_COMP_PO_FINAL_BILL_PER_DEL = 'customscript_comp_final_bill_dlvry';
// TS750
var SCRIPT_COMP_PO_LOCAL_BILL_PER_FINAL = 'customscript_comp_local_bill_per_final';
// TS760
var SCRIPT_COMP_PO_FINAL_BILL_PER_FINAL = 'customscript_comp_final_bill_per_final';

var COMPOSITE_TYPE_BILL_PER_DELIVERY = 1;
var COMPOSITE_TYPE_BILL_PER_FINAL = 2;
/**
 * 
 * @param type
 */

function wf_asn_closure() {

	var batch_code = nlapiGetContext().getSetting('SCRIPT', 'custscript_tss_batchcode');
	var batch_recid = nlapiGetContext().getSetting('SCRIPT', 'custscript_batch_control_rec');
	
	if (batch_code == null) {
		dLog(LOG_NAME, 'No Batch Code. Exit Program.');
		return;
	}  

	
	try {
		
		dLog(LOG_NAME, '>>>START<<<');
		dLog(LOG_NAME, batch_code);
		
		var filters = [];
		filters.push(new nlobjSearchFilter('custrecord_ts_asn_batch_code', null, 'is', batch_code));
		
		var rs = nlapiSearchRecord('customrecord_ts_asn', SS_ASN2PROCESS, filters);		
		if (rs == null) {
			dLog(LOG_NAME, 'No ASN to process. Exit script.');
            nlapiSubmitField('customrecord_ts_asn_batch_control', batch_recid, 'custrecord_batch_message', 'No ASN to process');
			return;
		}
		
		// This line below can remove if very sure no problem - Herman
		if (rs.length > 200){
			dLog(LOG_NAME, 'Too Many ASN to process. Please check and adjust limit');
		}
		
		nlapiSubmitField('customrecord_ts_asn_batch_control', batch_recid, ['custrecord_asn_count','custrecord_batch_status','custrecord_batch_message'], [rs.length,'3','']);
			
		
		for (var i = 0; i < rs.length; i++) {

			// get specific ASN
			var myasn = rs[i].getValue('internalid');
			// process_specific_asn(myasn);
			dLog(LOG_NAME, 'Specific ASN : ' + rs[i].getValue('name'));

			nlapiSubmitField('customrecord_ts_asn', myasn, 'custrecord_asn_reset', 'T');
		}

	}
	catch (e) {

		var stErrMsg = '';

		if (e.getDetails != undefined) {

			stErrMsg = 'Error Message : \r\n' + e.getCode() + '\r\n' + e.getDetails();
			nlapiLogExecution('Error', 'stErrMsg ', stErrMsg);
		}

		else {

			stErrMsg = 'Error Message : \r\n' + e.toString();
			nlapiLogExecution('Error', 'stErrMsg ', stErrMsg);
		}

		var usage = nlapiGetContext().getRemainingUsage();
		nlapiLogExecution('DEBUG', 'Remaining Usage ', usage);
	}
	executeRPOCompleted();
	dLog(LOG_NAME, '>>>FINISH<<<');
}

function executeRPOCompleted(){
	var status = nlapiScheduleScript('customscript_ts2_rlpo_completed','customdeploy_ts2_rlpo_completed');	
  dLog(LOG_NAME,'Running update to release po. Status: ' + status );
}

function process_specific_asn(recId) {

	var columns = [ new nlobjSearchColumn('custrecord_asn_reset') ];
	var rs = nlapiSearchRecord('customrecord_ts_asn', SAVED_SEARCH_ASN, new nlobjSearchFilter('internalid', null, 'anyOf', recId), columns);
	var asnReset = rs[0].getValue('custrecord_asn_reset');

	dLog(LOG_NAME, 'ASN Reset = ' + asnReset);

	if (asnReset == 'F') {
		dLog(LOG_NAME, 'Reset is not checked. Exit script.');
		return;
	}

	// Determine Customer Billing Type
	var custId = rs[0].getValue('custrecord_asn_bill_to_customer');

	if (isEmpty(custId)) {

		dLog(LOG_NAME, 'No customer in the record. Exit script!');
		return;
	}

	var custBillingType = nlapiLookupField('customer', custId, 'custentity_ts_customer_billing_type');

	dLog(LOG_NAME, 'Customer Id = ' + custId);
	dLog(LOG_NAME, 'Customer Billing Type = ' + custBillingType);

	// loop through ASN line using search as it return id not text/name value
	var blanketPO = '';
	for (var i = 0; i < rs.length; i++) {

		var blanketPOId = rs[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');

		if (!isEmpty(blanketPOId))
			blanketPO = blanketPOId;
	}

	dLog(LOG_NAME, 'Blanket PO | Id = ' + blanketPO);

	// Determining ASN PO Type
	if (!isEmpty(blanketPO)) {

		var status = '';
		var objBPO = getBlanketPOInfo(blanketPO);
		var compositeNo = (objBPO) ? objBPO[0].getValue('custrecord_ts_bpo_composite_no') : '';
		var deliveryToPONum = (objBPO) ? objBPO[0].getValue('custrecord_ts_bpo_delivery_to_po') : '';

		dLog(LOG_NAME, 'Composite No = ' + compositeNo);
		dLog(LOG_NAME, 'Delivery to PO Number = ' + deliveryToPONum);

		// If Composite Number field is empty, then that means it's a Single PO
		if (isEmpty(compositeNo)) {

			// calling single po scheduled script
			dAudit(LOG_NAME, 'Calling TS.20 scheduled script..');
			var myrp = nlapiSetRecoveryPoint();
			dLog(LOG_NAME, 'Set a Recovery Point : ' + myrp.status);
			var myyield = nlapiYieldScript();
			dLog(LOG_NAME, 'My Yield is : ' + myyield.status);
			status = nlapiScheduleScript(SCRIPT_SINGLE_PO_ID, null, {
				custscript_acp_asn_id : recId
			});
			if (status != 'QUEUED') {

				// status = nlapiScheduleScript(SCRIPT_SINGLE_PO_ID,
				// 'customdeploy2', {
				// custscript_acp_asn_id : recId
				// });
			}
			dLog(LOG_NAME, 'Schedule TS.20 Script Status = ' + status);

		} else {

			// If Composite Number field is not empty, then it is a Composite
			// PO.
			// Determine Composite Type is on the Customer record. There are two
			// values selectable for the Composite Type list field

			var compositeType = nlapiLookupField('customer', custId, 'custentity_ts_customer_composite_type');
			dLog(LOG_NAME, 'Composite Type = ' + compositeType);

			if (compositeType == COMPOSITE_TYPE_BILL_PER_DELIVERY) {

				// Bill per Delivery
				// On the TS Blanket Purchase Order record:

				// if the Delivery to PO Number is empty, then the vendor type
				// is Final Vendor
				if (isEmpty(deliveryToPONum)) {

					dAudit(LOG_NAME, 'Calling TS.40 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_FINAL_BILL_PER_DEL, 'customdeploy1', {
						custscript_compositepo_t40_asn_id : recId
					});
					dLog(LOG_NAME, 'Schedule TS.40 Script Status = ' + status);

				} else {

					// If the Delivery to PO Number is not empty, then the
					// vendor
					// type is Local Vendor
					dAudit(LOG_NAME, 'Calling TS.30 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_LOCAL_BILL_PER_DEL, 'customdeploy1', {
						custscript_compositepo_t30_asn_id : recId
					});
					dLog(LOG_NAME, 'Schedule TS.30 Script Status = ' + status);
				}

			} else if (compositeType == COMPOSITE_TYPE_BILL_PER_FINAL) {

				// Bill per Final
				if (isEmpty(deliveryToPONum)) {

					dAudit(LOG_NAME, 'Calling TS.60 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_FINAL_BILL_PER_FINAL, 'customdeploy1', {
						custscript_compositepo_t60_asn_id : recId
					});
					dLog(LOG_NAME, 'Schedule TS.60 Script Status = ' + status);

				} else {

					// If the Delivery to PO Number is not empty, then the
					// vendor
					// type is Local Vendor

					dAudit(LOG_NAME, 'Calling TS.50 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_LOCAL_BILL_PER_FINAL, 'customdeploy1', {
						custscript_compositepo_t50_asn_id : recId
					});
					dLog(LOG_NAME, 'Schedule TS.50 Script Status = ' + status);
				}
			}

			dLog(LOG_NAME, 'Sched Status = ' + status);
		}
	}

}

function getBlanketPOInfo(bpoId) {
	var filters = [ new nlobjSearchFilter('internalid', null, 'is', bpoId) ];
	var columns = [ new nlobjSearchColumn('custrecord_ts_bpo_composite_no'), new nlobjSearchColumn('custrecord_ts_bpo_delivery_to_po') ];

	return nlapiSearchRecord('customrecord_ts_blanket_po', null, filters, columns);
}
